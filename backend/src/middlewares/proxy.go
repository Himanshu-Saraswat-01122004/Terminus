package middlewares

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"terminas-core/src/config"
	"terminas-core/src/models"
	"terminas-core/src/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// WorkspaceProxyHandler handles reverse proxying HTTP & WebSockets to container agent
func WorkspaceProxyHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		containerIDStr := c.Param("id")
		containerID, err := uuid.Parse(containerIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
			c.Abort()
			return
		}

		// 1. Resolve token from Header, Cookie, or Query Params
		var tokenStr string
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenStr = parts[1]
			}
		}

		if tokenStr == "" {
			if cookie, err := c.Cookie("token"); err == nil {
				tokenStr = cookie
			}
		}

		if tokenStr == "" {
			tokenStr = c.Query("token")
		}

		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Workspace authentication token required"})
			c.Abort()
			return
		}

		// 2. Validate token claims
		claims, err := utils.ValidateToken(tokenStr)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid collaboration session"})
			c.Abort()
			return
		}

		userEmail := claims["email"].(string)

		// 3. Retrieve container details and guard ownership access
		var workspace models.Container
		if err := config.DB.First(&workspace, "id = ?", containerID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
			c.Abort()
			return
		}

		// Restrict access strictly to the workspace owner
		if workspace.Email != userEmail {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied: insufficient workspace permissions"})
			c.Abort()
			return
		}

		if workspace.Status != "running" || workspace.PrivateIP == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Workspace is not active or running"})
			c.Abort()
			return
		}

		// 4. Setup reverse proxy director
		targetURL, _ := url.Parse("http://" + workspace.PrivateIP + ":4000")
		proxy := httputil.NewSingleHostReverseProxy(targetURL)

		originalDirector := proxy.Director
		proxy.Director = func(req *http.Request) {
			originalDirector(req)
			// Strip the prefix /ws/container/:id from the request path
			prefixPath := "/ws/container/" + containerIDStr
			if strings.HasPrefix(req.URL.Path, prefixPath) {
				req.URL.Path = strings.TrimPrefix(req.URL.Path, prefixPath)
				if req.URL.Path == "" {
					req.URL.Path = "/"
				}
			}
			req.Header.Set("X-Forwarded-Host", req.Header.Get("Host"))
		}

		// Execute proxy request directly on the response writer
		proxy.ServeHTTP(c.Writer, c.Request)
		c.Abort()
	}
}

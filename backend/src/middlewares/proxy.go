package middlewares

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"terminas-core/src/config"
	"terminas-core/src/models"

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

		// Retrieve container private IP from PostgreSQL
		var workspace models.Container
		if err := config.DB.First(&workspace, "id = ?", containerID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
			c.Abort()
			return
		}

		if workspace.Status != "running" || workspace.PrivateIP == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Workspace is not active or running"})
			c.Abort()
			return
		}

		// Setup reverse proxy director
		targetURL, _ := url.Parse("http://" + workspace.PrivateIP + ":4000")
		proxy := httputil.NewSingleHostReverseProxy(targetURL)

		originalDirector := proxy.Director
		proxy.Director = func(req *http.Request) {
			originalDirector(req)
			// Strip the prefix /ws/container/:id from the request path
			// E.g., /ws/container/:id/project/files -> /project/files
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
		c.Abort() // Abort Gin request handling since proxy took over response output
	}
}

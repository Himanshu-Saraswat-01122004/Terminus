package main

import (
	"log"
	"net/http"
	"os"

	"terminas-core/src/config"
	"terminas-core/src/controllers"
	"terminas-core/src/middlewares"
	"terminas-core/src/services"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize database connection and schemas
	config.ConnectDatabase()

	// Initialize Docker connection and private network
	services.InitDockerClient()

	// Initialize Gin router
	router := gin.Default()

	// CORS Setup
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Default health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"message": "Terminas Orchestrator Backend is running.",
		})
	})

	// Auth routes group
	authRoutes := router.Group("/auth")
	{
		authRoutes.POST("/register", controllers.Register)
		authRoutes.POST("/login", controllers.Login)
		authRoutes.GET("/logout", controllers.Logout)
		authRoutes.GET("/github", controllers.RedirectToGitHub)
		authRoutes.GET("/github/callback", controllers.GitHubCallback)
		authRoutes.GET("/google", controllers.RedirectToGoogle)
		authRoutes.GET("/google/callback", controllers.GoogleCallback)
	}

	// User authenticated routes
	userRoutes := router.Group("/user")
	userRoutes.Use(middlewares.AuthMiddleware())
	{
		userRoutes.GET("/me", controllers.GetCurrentUser)
		userRoutes.POST("/profile-pic", controllers.UploadProfilePic)
	}

	// Container management routes (Authenticated)
	containerRoutes := router.Group("/containers")
	containerRoutes.Use(middlewares.AuthMiddleware())
	{
		containerRoutes.POST("/create", controllers.CreateWorkspace)
		containerRoutes.POST("/start", controllers.StartWorkspace)
		containerRoutes.POST("/stop", controllers.StopWorkspace)
		containerRoutes.DELETE("/:id", controllers.DeleteWorkspace)
		containerRoutes.GET("", controllers.ListWorkspaces)
	}

	// Dynamic Path-Based Reverse Proxy Gateway
	router.Any("/ws/container/:id/*any", middlewares.WorkspaceProxyHandler())

	// Public profile resource endpoint
	router.GET("/profile-pic/:email", controllers.DownloadProfilePic)

	// Get server port from env or fallback to 3000
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	log.Printf("Starting Terminas Orchestrator on port %s...", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

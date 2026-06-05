package main

import (
	"log"
	"net/http"
	"os"

	"terminas-core/src/config"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize database connection and schemas
	config.ConnectDatabase()

	// Initialize Gin router
	router := gin.Default()

	// Default health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"message": "Terminas Orchestrator Backend is running.",
		})
	})

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

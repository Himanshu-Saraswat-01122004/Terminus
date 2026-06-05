package controllers

import (
	"context"
	"net/http"
	"time"

	"terminas-core/src/config"
	"terminas-core/src/models"
	"terminas-core/src/services"

	"github.com/docker/docker/api/types"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type CreateWorkspaceInput struct {
	Name       string    `json:"name" binding:"required"`
	TemplateID uuid.UUID `json:"template_id" binding:"required"`
}

type WorkspaceActionInput struct {
	ContainerID uuid.UUID `json:"container_id" binding:"required"`
}

// CreateWorkspace provisions a new Docker container and registers it in PostgreSQL
func CreateWorkspace(c *gin.Context) {
	var input CreateWorkspaceInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userIDStr, _ := c.Get("userID")
	emailVal, _ := c.Get("email")
	userID, err := uuid.Parse(userIDStr.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user context"})
		return
	}

	// 1. Resolve template details
	var template models.Template
	if err := config.DB.First(&template, "id = ?", input.TemplateID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Environment template not found"})
		return
	}

	// 2. Spawn Docker Container with resource caps and mounts
	projectID := uuid.New().String()
	containerName := "terminas-" + projectID[:8]
	dockerID, ipAddress, err := services.ProvisionContainer(
		template.Image,
		containerName,
		userID.String(),
		projectID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 3. Save to database
	workspace := models.Container{
		Name:      input.Name,
		DockerID:  dockerID,
		PrivateIP: ipAddress,
		Template:  template.Name,
		Email:     emailVal.(string),
		UserID:    userID,
		Status:    "running",
		StartedAt: time.Now(),
	}

	if err := config.DB.Create(&workspace).Error; err != nil {
		// Cleanup Docker container on database error
		_ = services.RemoveContainer(dockerID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save workspace details to database"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":   "Workspace created and started successfully",
		"workspace": workspace,
	})
}

// StartWorkspace restarts an existing stopped workspace
func StartWorkspace(c *gin.Context) {
	var input WorkspaceActionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var workspace models.Container
	if err := config.DB.First(&workspace, "id = ?", input.ContainerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		return
	}

	// 1. Start Docker Container
	ctx := context.Background()
	err := services.DockerCli.ContainerStart(ctx, workspace.DockerID, types.ContainerStartOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restart workspace container"})
		return
	}

	// 2. Re-inspect private IP address
	inspect, err := services.DockerCli.ContainerInspect(ctx, workspace.DockerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve container network IP"})
		return
	}

	ipAddress := ""
	if settings, ok := inspect.NetworkSettings.Networks["terminas-net"]; ok {
		ipAddress = settings.IPAddress
	} else {
		ipAddress = inspect.NetworkSettings.IPAddress
	}

	// 3. Update DB
	workspace.PrivateIP = ipAddress
	workspace.Status = "running"
	workspace.StartedAt = time.Now()
	config.DB.Save(&workspace)

	c.JSON(http.StatusOK, gin.H{
		"message":   "Workspace started successfully",
		"workspace": workspace,
	})
}

// StopWorkspace stops a running container and calculates billing cost
func StopWorkspace(c *gin.Context) {
	var input WorkspaceActionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var workspace models.Container
	if err := config.DB.First(&workspace, "id = ?", input.ContainerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		return
	}

	if workspace.Status != "running" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Workspace is not currently running"})
		return
	}

	// 1. Stop container
	if err := services.StopContainer(workspace.DockerID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to stop container"})
		return
	}

	// 2. Fetch template details for pricing
	var template models.Template
	var hourlyRate float64 = 0.05 // Fallback pricing
	if err := config.DB.First(&template, "name = ?", workspace.Template).Error; err == nil {
		hourlyRate = template.Price
	}

	// 3. Billing calculation
	duration := time.Since(workspace.StartedAt)
	billableHours := duration.Hours()
	cost := billableHours * hourlyRate

	// 4. Update database user and workspace records
	config.DB.Model(&models.User{}).Where("id = ?", workspace.UserID).
		UpdateColumn("billing_amount", gorm.Expr("billing_amount + ?", cost))

	workspace.Status = "stopped"
	workspace.PrivateIP = ""
	config.DB.Save(&workspace)

	c.JSON(http.StatusOK, gin.H{
		"message":        "Workspace stopped",
		"duration_hours": billableHours,
		"cost":           cost,
		"workspace":      workspace,
	})
}

// DeleteWorkspace deletes both database record and container from Docker
func DeleteWorkspace(c *gin.Context) {
	containerIDStr := c.Param("id")
	containerID, err := uuid.Parse(containerIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	var workspace models.Container
	if err := config.DB.First(&workspace, "id = ?", containerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		return
	}

	// 1. Force remove Docker container
	_ = services.RemoveContainer(workspace.DockerID)

	// 2. Perform database cleanup
	if err := config.DB.Delete(&workspace).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete database record"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Workspace deleted successfully"})
}

// ListWorkspaces lists all containers owned by the authenticated user
func ListWorkspaces(c *gin.Context) {
	email, _ := c.Get("email")

	var workspaces []models.Container
	if err := config.DB.Where("email = ?", email).Find(&workspaces).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query workspaces"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"workspaces": workspaces})
}

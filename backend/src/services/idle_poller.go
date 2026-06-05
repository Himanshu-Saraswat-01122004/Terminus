package services

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"terminas-core/src/config"
	"terminas-core/src/models"
)

// StartIdlePoller queries running container agent idle status every 1 minute
func StartIdlePoller() {
	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		for range ticker.C {
			pollRunningContainers()
		}
	}()
}

func pollRunningContainers() {
	var workspaces []models.Container
	if err := config.DB.Where("status = ?", "running").Find(&workspaces).Error; err != nil {
		return
	}

	for _, ws := range workspaces {
		if ws.PrivateIP == "" {
			continue
		}
		go checkAndSuspendContainer(ws)
	}
}

func checkAndSuspendContainer(ws models.Container) {
	// Call internal container agent idle endpoint
	url := "http://" + ws.PrivateIP + ":4000/idle-status"
	client := http.Client{Timeout: 3 * time.Second}

	resp, err := client.Get(url)
	if err != nil {
		return // Container may be launching or agent not listening yet
	}
	defer resp.Body.Close()

	var status struct {
		IsIdle bool `json:"is_idle"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return
	}

	// Trigger auto-suspension if idle duration exceeds 15 minutes limit
	if status.IsIdle {
		log.Printf("[AUTO-SUSPEND] Container %s (%s) is idle. Stopping container...", ws.Name, ws.ID)

		// 1. Terminate Docker container
		if err := StopContainer(ws.DockerID); err != nil {
			log.Printf("[AUTO-SUSPEND] Error stopping container: %v", err)
			return
		}

		// 2. Perform database updates (stop state, clear IP)
		now := time.Now()
		duration := now.Sub(ws.StartedAt).Hours()

		// Retrieve template cost rate
		var template models.Template
		rate := 0.05
		if err := config.DB.First(&template, "id = ?", ws.TemplateID).Error; err == nil {
			rate = template.Price
		}
		cost := duration * rate

		tx := config.DB.Begin()
		if err := tx.Model(&ws).Updates(map[string]interface{}{
			"status":     "stopped",
			"private_ip": "",
		}).Error; err != nil {
			tx.Rollback()
			return
		}

		// Increment billing log
		var user models.User
		if err := tx.First(&user, "email = ?", ws.Email).Error; err == nil {
			tx.Model(&user).Update("billing_amount", user.BillingAmount+cost)
		}
		tx.Commit()
		log.Printf("[AUTO-SUSPEND] Container %s stopped, logged billing charge of $%f", ws.Name, cost)
	}
}

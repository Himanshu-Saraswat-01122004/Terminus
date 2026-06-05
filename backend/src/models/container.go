package models

import (
	"time"

	"github.com/google/uuid"
)

type Container struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;" json:"id"`
	Name      string    `gorm:"type:varchar(100);not null;" json:"name"`
	DockerID  string    `gorm:"type:varchar(100);uniqueIndex;not null;" json:"docker_id"`
	PrivateIP string    `gorm:"type:varchar(45);not null;" json:"private_ip"`
	Template  string    `gorm:"type:varchar(100);not null;" json:"template"`
	Email     string    `gorm:"type:varchar(100);index;not null;" json:"email"`
	UserID    uuid.UUID `gorm:"type:uuid;index;not null;" json:"user_id"`
	Status    string    `gorm:"type:varchar(20);default:'starting';not null;" json:"status"` // starting, running, stopped, failed
	StartedAt time.Time `json:"started_at"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// BeforeCreate hook to generate UUID
func (c *Container) BeforeCreate() {
	c.ID = uuid.New()
}

package models

import (
	"time"

	"github.com/google/uuid"
)

type Template struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;" json:"id"`
	Name        string    `gorm:"type:varchar(100);uniqueIndex;not null;" json:"name"`
	Description string    `gorm:"type:text;" json:"description"`
	Image       string    `gorm:"type:varchar(255);not null;" json:"image"`
	Price       float64   `gorm:"type:numeric(10,4);default:0.0000;not null;" json:"price"` // Price per hour (e.g., 0.0500)
	IsApproved  bool      `gorm:"default:false;not null;" json:"is_approved"`
	CreatedBy   string    `gorm:"type:varchar(100);not null;" json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// BeforeCreate hook to generate UUID
func (t *Template) BeforeCreate() {
	t.ID = uuid.New()
}

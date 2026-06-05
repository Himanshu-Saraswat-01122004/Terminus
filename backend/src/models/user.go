package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey;" json:"id"`
	Username       string         `gorm:"type:varchar(100);not null;" json:"username"`
	Email          string         `gorm:"type:varchar(100);uniqueIndex;not null;" json:"email"`
	Password       string         `gorm:"type:varchar(255);not null;" json:"-"`
	Role           string         `gorm:"type:varchar(20);default:'user';not null;" json:"role"` // user, dev, admin
	Bio            string         `gorm:"type:text;" json:"bio"`
	ProfilePic     []byte         `gorm:"type:bytea;" json:"profile_pic,omitempty"`
	BillingAmount  float64        `gorm:"type:numeric(10,2);default:0.00;not null;" json:"billing_amount"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

// BeforeCreate hook to generate UUID before saving user
func (u *User) BeforeCreate(tx *gorm.DB) (err error) {
	u.ID = uuid.New()
	return
}

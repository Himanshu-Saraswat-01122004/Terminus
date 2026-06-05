package config

import (
	"fmt"
	"log"
	"os"
	"time"

	"terminas-core/src/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// ConnectDatabase initializes connection to PostgreSQL database
func ConnectDatabase() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		// Default development fallback DSN
		dsn = "host=localhost user=postgres password=postgres dbname=terminas port=5432 sslmode=disable"
	}

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})

	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Configure connection pooling
	sqlDB, err := DB.DB()
	if err != nil {
		log.Fatalf("Failed to retrieve SQL database handle: %v", err)
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	fmt.Println("Database connection established successfully.")

	// Auto Migrate the schemas
	err = DB.AutoMigrate(&models.User{}, &models.Container{}, &models.Template{})
	if err != nil {
		log.Fatalf("Failed to auto-migrate database schemas: %v", err)
	}
	fmt.Println("Database migration completed successfully.")
}

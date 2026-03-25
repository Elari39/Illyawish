package main

import (
	"log"

	"backend/internal/app"
)

func main() {
	application, err := app.New()
	if err != nil {
		log.Fatalf("failed to initialize app: %v", err)
	}

	if err := application.Run(); err != nil {
		log.Fatalf("server exited with error: %v", err)
	}
}

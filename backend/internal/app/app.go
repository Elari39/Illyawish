package app

import (
	"fmt"
	"net/http"

	"backend/internal/auth"
	"backend/internal/chat"
	"backend/internal/config"
	"backend/internal/database"
	"backend/internal/llm"
	"backend/internal/provider"

	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

type App struct {
	config *config.Config
	router *gin.Engine
}

func New() (*App, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}

	db, err := database.Open(cfg)
	if err != nil {
		return nil, err
	}

	model := llm.New()

	providerService, err := provider.NewService(db, cfg)
	if err != nil {
		return nil, err
	}

	authHandler := auth.NewHandler(db)
	chatService := chat.NewService(db, model, providerService)
	chatHandler := chat.NewHandler(chatService)
	providerHandler := provider.NewHandler(providerService)

	router := gin.New()
	if err := router.SetTrustedProxies(nil); err != nil {
		return nil, fmt.Errorf("configure trusted proxies: %w", err)
	}
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.FrontendOrigin, "http://127.0.0.1:5173", "http://localhost:5173"},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{"Content-Type", "Accept"},
		AllowCredentials: true,
	}))

	store := cookie.NewStore([]byte(cfg.SessionSecret))
	store.Options(sessions.Options{
		Path:     "/",
		HttpOnly: true,
		MaxAge:   60 * 60 * 24 * 7,
		SameSite: http.SameSiteLaxMode,
	})
	router.Use(sessions.Sessions("aichat_session", store))

	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	authGroup := router.Group("/api/auth")
	{
		authGroup.POST("/login", authHandler.Login)
		authGroup.POST("/logout", auth.RequireAuth(db), authHandler.Logout)
		authGroup.GET("/me", auth.RequireAuth(db), authHandler.Me)
	}

	api := router.Group("/api")
	api.Use(auth.RequireAuth(db))
	{
		api.GET("/ai/providers", providerHandler.ListProviders)
		api.POST("/ai/providers", providerHandler.CreateProvider)
		api.PATCH("/ai/providers/:id", providerHandler.UpdateProvider)
		api.POST("/ai/providers/:id/activate", providerHandler.ActivateProvider)
		api.DELETE("/ai/providers/:id", providerHandler.DeleteProvider)

		api.GET("/conversations", chatHandler.ListConversations)
		api.POST("/conversations", chatHandler.CreateConversation)
		api.PATCH("/conversations/:id", chatHandler.UpdateConversation)
		api.GET("/conversations/:id/messages", chatHandler.ListMessages)
		api.POST("/conversations/:id/messages", chatHandler.StreamMessage)
		api.POST("/conversations/:id/messages/regenerate", chatHandler.RegenerateMessage)
		api.POST("/conversations/:id/messages/:messageId/retry", chatHandler.RetryMessage)
		api.PATCH("/conversations/:id/messages/:messageId", chatHandler.EditMessage)
		api.POST("/conversations/:id/cancel", chatHandler.CancelGeneration)
		api.DELETE("/conversations/:id", chatHandler.DeleteConversation)
	}

	return &App{
		config: cfg,
		router: router,
	}, nil
}

func (a *App) Run() error {
	return a.router.Run(fmt.Sprintf(":%s", a.config.ServerPort))
}

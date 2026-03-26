package app

import (
	"fmt"
	"net/http"

	"backend/internal/attachment"
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

const (
	smallJSONBodyLimit  = 32 * 1024
	mediumJSONBodyLimit = 128 * 1024
	chatJSONBodyLimit   = 256 * 1024
	uploadBodyLimit     = 8 * 1024 * 1024
)

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
	providerTester := provider.NewLLMProviderTester(model)

	if err := auth.EnsureBootstrapUser(db, cfg); err != nil {
		return nil, err
	}

	attachmentService, err := attachment.NewService(db, cfg)
	if err != nil {
		return nil, err
	}

	providerService, err := provider.NewService(db, cfg, providerTester)
	if err != nil {
		return nil, err
	}

	authHandler := auth.NewHandler(db)
	chatService := chat.NewService(db, model, providerService, attachmentService)
	chatHandler := chat.NewHandler(chatService)
	providerHandler := provider.NewHandler(providerService)
	attachmentHandler := attachment.NewHandler(attachmentService)

	router := gin.New()
	if err := router.SetTrustedProxies(nil); err != nil {
		return nil, fmt.Errorf("configure trusted proxies: %w", err)
	}
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.FrontendOrigin, "http://127.0.0.1:10170", "http://localhost:10170"},
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
		authGroup.GET("/bootstrap/status", authHandler.BootstrapStatus)
		authGroup.POST("/bootstrap", limitRequestBody(smallJSONBodyLimit), authHandler.Bootstrap)
		authGroup.POST("/login", limitRequestBody(smallJSONBodyLimit), authHandler.Login)
		authGroup.POST("/logout", auth.RequireAuth(db), authHandler.Logout)
		authGroup.GET("/me", auth.RequireAuth(db), authHandler.Me)
	}

	api := router.Group("/api")
	api.Use(auth.RequireAuth(db))
	{
		api.POST("/attachments", limitRequestBody(uploadBodyLimit), attachmentHandler.Upload)
		api.GET("/attachments/:id/file", attachmentHandler.File)

		api.GET("/ai/providers", providerHandler.ListProviders)
		api.POST("/ai/providers", limitRequestBody(mediumJSONBodyLimit), providerHandler.CreateProvider)
		api.POST("/ai/providers/test", limitRequestBody(mediumJSONBodyLimit), providerHandler.TestProvider)
		api.PATCH("/ai/providers/:id", limitRequestBody(mediumJSONBodyLimit), providerHandler.UpdateProvider)
		api.POST("/ai/providers/:id/activate", providerHandler.ActivateProvider)
		api.DELETE("/ai/providers/:id", providerHandler.DeleteProvider)

		api.GET("/conversations", chatHandler.ListConversations)
		api.POST("/conversations", chatHandler.CreateConversation)
		api.PATCH("/conversations/:id", limitRequestBody(mediumJSONBodyLimit), chatHandler.UpdateConversation)
		api.GET("/conversations/:id/messages", chatHandler.ListMessages)
		api.POST("/conversations/:id/messages", limitRequestBody(chatJSONBodyLimit), chatHandler.StreamMessage)
		api.POST("/conversations/:id/messages/regenerate", limitRequestBody(chatJSONBodyLimit), chatHandler.RegenerateMessage)
		api.POST("/conversations/:id/messages/:messageId/retry", limitRequestBody(chatJSONBodyLimit), chatHandler.RetryMessage)
		api.PATCH("/conversations/:id/messages/:messageId", limitRequestBody(chatJSONBodyLimit), chatHandler.EditMessage)
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

func limitRequestBody(limit int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		}
		c.Next()
	}
}

package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"backend/internal/admin"
	"backend/internal/attachment"
	"backend/internal/audit"
	"backend/internal/auth"
	"backend/internal/chat"
	"backend/internal/config"
	"backend/internal/database"
	"backend/internal/llm"
	"backend/internal/models"
	"backend/internal/provider"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

type App struct {
	config *config.Config
	router *gin.Engine
	server *http.Server
}

const (
	smallJSONBodyLimit  = 32 * 1024
	mediumJSONBodyLimit = 128 * 1024
	chatJSONBodyLimit   = 256 * 1024
	uploadBodyLimit     = 8 * 1024 * 1024
	readHeaderTimeout   = 5 * time.Second
	readTimeout         = 15 * time.Second
	writeTimeout        = 0
	idleTimeout         = 60 * time.Second
	shutdownTimeout     = 10 * time.Second
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
	auditService := audit.NewService(db)

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

	authHandler := auth.NewHandler(db, auditService)
	chatService := chat.NewService(db, model, providerService, attachmentService)
	chatHandler := chat.NewHandler(chatService)
	providerHandler := provider.NewHandler(providerService, auditService)
	attachmentHandler := attachment.NewHandler(attachmentService)
	adminService := admin.NewService(db, auditService)
	adminHandler := admin.NewHandler(adminService)

	router := gin.New()
	if err := router.SetTrustedProxies(nil); err != nil {
		return nil, fmt.Errorf("configure trusted proxies: %w", err)
	}
	router.Use(gin.Logger(), gin.Recovery())

	store := cookie.NewStore([]byte(cfg.SessionSecret))
	router.Use(sessions.Sessions("aichat_session", store))
	router.Use(func(c *gin.Context) {
		sessions.Default(c).Options(sessionOptionsForRequest(c.Request, cfg.TrustProxyHeadersForSecureCookies))
		c.Next()
	})

	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	authGroup := router.Group("/api/auth")
	{
		authGroup.GET("/bootstrap/status", authHandler.BootstrapStatus)
		authGroup.POST("/bootstrap", limitRequestBody(smallJSONBodyLimit), authHandler.Bootstrap)
		authGroup.POST("/login", limitRequestBody(smallJSONBodyLimit), authHandler.Login)
		authGroup.POST("/logout", auth.RequireAuth(db), authHandler.Logout)
		authGroup.POST("/change-password", auth.RequireAuth(db), limitRequestBody(smallJSONBodyLimit), authHandler.ChangePassword)
		authGroup.POST("/logout-all", auth.RequireAuth(db), authHandler.LogoutAll)
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

		api.GET("/chat/settings", chatHandler.GetChatSettings)
		api.PATCH("/chat/settings", limitRequestBody(mediumJSONBodyLimit), chatHandler.UpdateChatSettings)
		api.GET("/conversations", chatHandler.ListConversations)
		api.POST("/conversations", chatHandler.CreateConversation)
		api.POST("/conversations/import", limitRequestBody(chatJSONBodyLimit), chatHandler.ImportConversation)
		api.PATCH("/conversations/:id", limitRequestBody(mediumJSONBodyLimit), chatHandler.UpdateConversation)
		api.GET("/conversations/:id/messages", chatHandler.ListMessages)
		api.POST("/conversations/:id/messages", limitRequestBody(chatJSONBodyLimit), chatHandler.StreamMessage)
		api.POST("/conversations/:id/messages/regenerate", limitRequestBody(chatJSONBodyLimit), chatHandler.RegenerateMessage)
		api.POST("/conversations/:id/messages/:messageId/regenerate", limitRequestBody(chatJSONBodyLimit), chatHandler.RegenerateMessageByID)
		api.POST("/conversations/:id/messages/:messageId/retry", limitRequestBody(chatJSONBodyLimit), chatHandler.RetryMessage)
		api.PATCH("/conversations/:id/messages/:messageId", limitRequestBody(chatJSONBodyLimit), chatHandler.EditMessage)
		api.POST("/conversations/:id/cancel", chatHandler.CancelGeneration)
		api.DELETE("/conversations/:id", chatHandler.DeleteConversation)
	}

	adminAPI := api.Group("/admin")
	adminAPI.Use(auth.RequireRole(models.UserRoleAdmin))
	{
		adminAPI.GET("/users", adminHandler.ListUsers)
		adminAPI.POST("/users", limitRequestBody(mediumJSONBodyLimit), adminHandler.CreateUser)
		adminAPI.PATCH("/users/:id", limitRequestBody(mediumJSONBodyLimit), adminHandler.UpdateUser)
		adminAPI.POST("/users/:id/reset-password", limitRequestBody(smallJSONBodyLimit), adminHandler.ResetPassword)
		adminAPI.GET("/audit-logs", adminHandler.ListAuditLogs)
		adminAPI.GET("/usage-stats", adminHandler.GetUsageStats)
		adminAPI.GET("/workspace-policy", adminHandler.GetWorkspacePolicy)
		adminAPI.PATCH("/workspace-policy", limitRequestBody(mediumJSONBodyLimit), adminHandler.UpdateWorkspacePolicy)
	}

	server := newHTTPServer(fmt.Sprintf(":%s", cfg.ServerPort), router)

	return &App{
		config: cfg,
		router: router,
		server: server,
	}, nil
}

func newHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		// Disable the write deadline so long-lived SSE chat streams are not cut off.
		WriteTimeout: writeTimeout,
		IdleTimeout:  idleTimeout,
	}
}

func sessionOptionsForRequest(request *http.Request, trustProxyHeaders bool) sessions.Options {
	return sessions.Options{
		Path:     "/",
		HttpOnly: true,
		MaxAge:   60 * 60 * 24 * 7,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(request, trustProxyHeaders),
	}
}

func isSecureRequest(request *http.Request, trustProxyHeaders bool) bool {
	if request == nil {
		return false
	}
	if request.TLS != nil {
		return true
	}
	if !trustProxyHeaders {
		return false
	}

	forwardedProto := strings.ToLower(strings.TrimSpace(request.Header.Get("X-Forwarded-Proto")))
	if forwardedProto == "https" {
		return true
	}

	forwardedSSL := strings.ToLower(strings.TrimSpace(request.Header.Get("X-Forwarded-Ssl")))
	return forwardedSSL == "on"
}

func (a *App) Run() error {
	shutdownSignals, stop := signal.NotifyContext(
		context.Background(),
		syscall.SIGINT,
		syscall.SIGTERM,
	)
	defer stop()

	serverErrCh := make(chan error, 1)
	go func() {
		serverErrCh <- a.server.ListenAndServe()
	}()

	select {
	case err := <-serverErrCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-shutdownSignals.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()

		if err := a.server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown server: %w", err)
		}

		err := <-serverErrCh
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}

func limitRequestBody(limit int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		}
		c.Next()
	}
}

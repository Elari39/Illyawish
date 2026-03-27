package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/models"

	"github.com/gin-gonic/gin"
)

func TestRequireRoleRejectsNonAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, engine := gin.CreateTestContext(recorder)
	request := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	ctx.Request = request

	engine.Use(func(c *gin.Context) {
		c.Set(contextKeyUser, &models.User{
			ID:       2,
			Username: "member",
			Role:     models.UserRoleMember,
			Status:   models.UserStatusActive,
		})
	})
	engine.Use(RequireRole(models.UserRoleAdmin))
	engine.GET("/api/admin/users", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	engine.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-admin user, got %d", recorder.Code)
	}
}

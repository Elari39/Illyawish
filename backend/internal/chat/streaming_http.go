package chat

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) streamAction(
	c *gin.Context,
	action func(writeEvent func(StreamEvent) error) error,
) {
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming is unsupported"})
		return
	}

	started := false

	writeEvent := func(event StreamEvent) error {
		if !started {
			c.Writer.Header().Set("Content-Type", "text/event-stream")
			c.Writer.Header().Set("Cache-Control", "no-cache")
			c.Writer.Header().Set("Connection", "keep-alive")
			c.Writer.Header().Set("X-Accel-Buffering", "no")
			c.Status(http.StatusOK)
			started = true
		}

		payload, err := json.Marshal(event)
		if err != nil {
			return fmt.Errorf("marshal stream event: %w", err)
		}

		if _, err := c.Writer.Write([]byte("event: " + event.Type + "\n")); err != nil {
			return err
		}
		if _, err := c.Writer.Write([]byte("data: " + string(payload) + "\n\n")); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	if err := action(writeEvent); err != nil {
		if !started {
			handleChatError(c, err)
			return
		}

		_ = writeEvent(StreamEvent{
			Type:  "error",
			Error: errorMessage(err),
		})
	}
}

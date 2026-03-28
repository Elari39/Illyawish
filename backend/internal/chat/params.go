package chat

import (
	"errors"
	"io"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func listConversationsParams(c *gin.Context) (ListConversationsParams, error) {
	params := ListConversationsParams{
		Search: c.Query("search"),
	}

	if archivedRaw := c.Query("archived"); archivedRaw != "" {
		archived, err := strconv.ParseBool(archivedRaw)
		if err != nil {
			return ListConversationsParams{}, errors.New("archived must be a boolean")
		}
		params.Archived = archived
	}

	if limitRaw := c.Query("limit"); limitRaw != "" {
		limit, err := strconv.Atoi(limitRaw)
		if err != nil {
			return ListConversationsParams{}, errors.New("limit must be a number")
		}
		params.Limit = limit
	}

	if offsetRaw := c.Query("offset"); offsetRaw != "" {
		offset, err := strconv.Atoi(offsetRaw)
		if err != nil {
			return ListConversationsParams{}, errors.New("offset must be a number")
		}
		params.Offset = offset
	}

	return params, nil
}

func listMessagesParams(c *gin.Context) (ListMessagesParams, error) {
	params := ListMessagesParams{}

	if limitRaw := c.Query("limit"); limitRaw != "" {
		limit, err := strconv.Atoi(limitRaw)
		if err != nil {
			return ListMessagesParams{}, errors.New("limit must be a number")
		}
		params.Limit = limit
	}

	if beforeIDRaw := c.Query("beforeId"); beforeIDRaw != "" {
		beforeID, err := strconv.ParseUint(beforeIDRaw, 10, 64)
		if err != nil {
			return ListMessagesParams{}, errors.New("beforeId must be a number")
		}
		value := uint(beforeID)
		params.BeforeID = &value
	}

	return params, nil
}

func conversationIDParam(c *gin.Context) (string, error) {
	rawID := c.Param("id")
	parsed, err := uuid.Parse(rawID)
	if err != nil {
		return "", err
	}
	return parsed.String(), nil
}

func messageIDParam(c *gin.Context) (uint, error) {
	rawID := c.Param("messageId")
	id, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(id), nil
}

func bindOptionalJSON(c *gin.Context, target any) error {
	if c.Request.Body == nil || c.Request.ContentLength == 0 {
		return nil
	}

	if err := c.ShouldBindJSON(target); err != nil {
		if errors.Is(err, io.EOF) {
			return nil
		}
		return err
	}
	return nil
}

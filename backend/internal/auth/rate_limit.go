package auth

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

const (
	loginRateLimitWindow      = 10 * time.Minute
	loginRateLimitBlockWindow = 10 * time.Minute
	loginRateLimitMaxAttempts = 5
)

type loginAttemptState struct {
	attempts    int
	firstFailed time.Time
	blockedTill time.Time
}

type loginRateLimiter struct {
	mu       sync.Mutex
	attempts map[string]loginAttemptState
	now      func() time.Time
}

func newLoginRateLimiter() *loginRateLimiter {
	return &loginRateLimiter{
		attempts: map[string]loginAttemptState{},
		now:      time.Now,
	}
}

func loginAttemptKey(clientIP string, username string) string {
	return fmt.Sprintf("%s:%s", strings.TrimSpace(clientIP), strings.ToLower(strings.TrimSpace(username)))
}

func (l *loginRateLimiter) Allow(key string) (int, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	state, ok := l.attempts[key]
	if !ok {
		return 0, false
	}

	now := l.now()
	if !state.blockedTill.IsZero() && now.Before(state.blockedTill) {
		return int(state.blockedTill.Sub(now).Seconds()), true
	}

	if !state.firstFailed.IsZero() && now.Sub(state.firstFailed) > loginRateLimitWindow {
		delete(l.attempts, key)
	}

	return 0, false
}

func (l *loginRateLimiter) RecordFailure(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	state := l.attempts[key]
	if state.firstFailed.IsZero() || now.Sub(state.firstFailed) > loginRateLimitWindow {
		state = loginAttemptState{
			attempts:    1,
			firstFailed: now,
		}
		l.attempts[key] = state
		return
	}

	state.attempts += 1
	if state.attempts >= loginRateLimitMaxAttempts {
		state.blockedTill = now.Add(loginRateLimitBlockWindow)
	}
	l.attempts[key] = state
}

func (l *loginRateLimiter) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}

package agent

import (
	"errors"
	"sync"

	"github.com/google/uuid"
)

type ConfirmationManager struct {
	mu       sync.Mutex
	pending  map[string]chan bool
}

func NewConfirmationManager() *ConfirmationManager {
	return &ConfirmationManager{pending: map[string]chan bool{}}
}

func (m *ConfirmationManager) Register() (string, <-chan bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	id := uuid.NewString()
	ch := make(chan bool, 1)
	m.pending[id] = ch
	return id, ch
}

func (m *ConfirmationManager) Resolve(id string, approved bool) error {
	m.mu.Lock()
	ch, ok := m.pending[id]
	if ok {
		delete(m.pending, id)
	}
	m.mu.Unlock()
	if !ok {
		return errors.New("confirmation not found")
	}
	ch <- approved
	close(ch)
	return nil
}

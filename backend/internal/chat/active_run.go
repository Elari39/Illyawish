package chat

import (
	"context"
	"sync"
	"time"
)

const (
	defaultDetachTimeout = 60 * time.Second
	activeRunBufferLimit = 512
	activeRunChannelSize = 128
)

type runCancelReason string

const (
	runCancelReasonNone     runCancelReason = ""
	runCancelReasonUser     runCancelReason = "user"
	runCancelReasonDetached runCancelReason = "detached"
)

type activeRun struct {
	mu sync.Mutex

	conversationID uint
	ctx            context.Context
	cancel         context.CancelFunc
	done           chan struct{}

	nextSeq        int
	events         []StreamEvent
	subscribers    map[int]chan StreamEvent
	nextSubscriber int
	finished       bool
	cancelReason   runCancelReason
	detachTimer    *time.Timer
}

func newActiveRun(conversationID uint) *activeRun {
	ctx, cancel := context.WithCancel(context.Background())
	return &activeRun{
		conversationID: conversationID,
		ctx:            ctx,
		cancel:         cancel,
		done:           make(chan struct{}),
		subscribers:    make(map[int]chan StreamEvent),
	}
}

func (r *activeRun) subscribe(afterSeq int) ([]StreamEvent, <-chan StreamEvent, func()) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.detachTimer != nil {
		r.detachTimer.Stop()
		r.detachTimer = nil
	}

	events := make([]StreamEvent, 0, len(r.events))
	for _, event := range r.events {
		if event.Seq > afterSeq {
			events = append(events, event)
		}
	}

	ch := make(chan StreamEvent, activeRunChannelSize)
	if r.finished {
		close(ch)
		return events, ch, func() {}
	}

	subscriberID := r.nextSubscriber
	r.nextSubscriber++
	r.subscribers[subscriberID] = ch

	unsubscribe := func() {
		r.mu.Lock()
		defer r.mu.Unlock()

		subscriber, exists := r.subscribers[subscriberID]
		if !exists {
			return
		}

		delete(r.subscribers, subscriberID)
		close(subscriber)
	}

	return events, ch, unsubscribe
}

func (r *activeRun) publish(event StreamEvent) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.finished {
		return
	}

	r.nextSeq++
	event.Seq = r.nextSeq
	r.events = append(r.events, event)
	if len(r.events) > activeRunBufferLimit {
		r.events = append([]StreamEvent(nil), r.events[len(r.events)-activeRunBufferLimit:]...)
	}

	for subscriberID, subscriber := range r.subscribers {
		select {
		case subscriber <- event:
		default:
			close(subscriber)
			delete(r.subscribers, subscriberID)
		}
	}
}

func (r *activeRun) finish() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.finished {
		return
	}

	r.finished = true
	if r.detachTimer != nil {
		r.detachTimer.Stop()
		r.detachTimer = nil
	}

	for subscriberID, subscriber := range r.subscribers {
		close(subscriber)
		delete(r.subscribers, subscriberID)
	}

	close(r.done)
}

func (r *activeRun) setCancelReason(reason runCancelReason) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cancelReason == runCancelReasonNone {
		r.cancelReason = reason
	}
}

func (r *activeRun) getCancelReason() runCancelReason {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.cancelReason
}

func (r *activeRun) subscriberCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.subscribers)
}

func (r *activeRun) wait(ctx context.Context) bool {
	select {
	case <-r.done:
		return true
	case <-ctx.Done():
		return false
	}
}

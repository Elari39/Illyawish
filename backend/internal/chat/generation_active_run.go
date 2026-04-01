package chat

import (
	"context"
	"time"
)

const subscriberDisconnectGracePeriod = 50 * time.Millisecond

func (s *Service) launchActiveRun(
	requestCtx context.Context,
	conversationID uint,
	execute func(run *activeRun) error,
	emit func(StreamEvent) error,
) error {
	run, err := s.registerActiveStream(conversationID)
	if err != nil {
		return err
	}

	events, subscriber, unsubscribe := run.subscribe(0)
	cleanupSubscription := func() {
		unsubscribe()
		s.scheduleDetachCancellation(conversationID, run)
	}
	defer cleanupSubscription()

	go func() {
		defer s.finishActiveStream(conversationID, run)
		s.publishActiveRunError(run, execute(run))
	}()

	for _, event := range events {
		if err := emit(event); err != nil {
			s.waitForRunGracefully(conversationID)
			return nil
		}
	}

	for {
		select {
		case <-requestCtx.Done():
			return nil
		case event, ok := <-subscriber:
			if !ok {
				return nil
			}
			if err := emit(event); err != nil {
				s.waitForRunGracefully(conversationID)
				return nil
			}
		}
	}
}

func (s *Service) registerActiveStream(
	conversationID uint,
) (*activeRun, error) {
	s.activeMu.Lock()
	if _, exists := s.activeStreams[conversationID]; exists {
		s.activeMu.Unlock()
		return nil, ErrConversationBusy
	}
	run := newActiveRun(conversationID)
	s.activeStreams[conversationID] = run
	s.activeMu.Unlock()

	return run, nil
}

func (s *Service) finishActiveStream(conversationID uint, run *activeRun) {
	run.finish()
	run.cancel()

	s.activeMu.Lock()
	if current, exists := s.activeStreams[conversationID]; exists && current == run {
		delete(s.activeStreams, conversationID)
	}
	s.activeMu.Unlock()
}

func (s *Service) withActiveStream(conversationID uint, fn func(*activeRun) error) error {
	s.activeMu.Lock()
	run, exists := s.activeStreams[conversationID]
	s.activeMu.Unlock()
	if !exists {
		return ErrNoActiveStream
	}

	return fn(run)
}

func (s *Service) streamActiveRun(
	requestCtx context.Context,
	conversationID uint,
	afterSeq int,
	emit func(StreamEvent) error,
) error {
	return s.withActiveStream(conversationID, func(run *activeRun) error {
		events, subscriber, unsubscribe := run.subscribe(afterSeq)
		cleanupSubscription := func() {
			unsubscribe()
			s.scheduleDetachCancellation(conversationID, run)
		}
		defer cleanupSubscription()

		for _, event := range events {
			if err := emit(event); err != nil {
				return nil
			}
		}

		for {
			select {
			case <-requestCtx.Done():
				return nil
			case event, ok := <-subscriber:
				if !ok {
					return nil
				}
				if err := emit(event); err != nil {
					return nil
				}
			}
		}
	})
}

func (s *Service) waitForActiveRunCompletion(
	ctx context.Context,
	conversationID uint,
) bool {
	s.activeMu.Lock()
	run, exists := s.activeStreams[conversationID]
	s.activeMu.Unlock()
	if !exists {
		return true
	}

	return run.wait(ctx)
}

func (s *Service) scheduleDetachCancellation(conversationID uint, run *activeRun) {
	run.mu.Lock()
	defer run.mu.Unlock()

	if run.finished || len(run.subscribers) > 0 || run.detachTimer != nil {
		return
	}

	done := run.done
	run.detachTimer = time.AfterFunc(s.detachTimeout, func() {
		run.setCancelReason(runCancelReasonDetached)
		run.cancel()
		<-done
	})
}

func (s *Service) publishActiveRunError(run *activeRun, err error) {
	if err == nil {
		return
	}

	run.publish(StreamEvent{
		Type:  "error",
		Error: errorMessage(err),
	})
}

func (s *Service) waitForRunGracefully(conversationID uint) {
	waitCtx, cancel := context.WithTimeout(context.Background(), subscriberDisconnectGracePeriod)
	defer cancel()
	s.waitForActiveRunCompletion(waitCtx, conversationID)
}

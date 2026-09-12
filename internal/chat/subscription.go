package chat

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"sync"
)

const MaxSubscriptionBytes = 16 << 20

var ErrSlowSubscriber = errors.New("subscriber queue exceeded its budget; request a new snapshot")

// Update is an ordered application notification, including the initial snapshot.
type Update struct {
	RequestID   string
	Snapshot    *Snapshot
	Event       *Event
	Interaction *PendingInteraction
	Resolved    *PendingInteraction
	Outcome     *Outcome
}

type queuedUpdate struct {
	update Update
	size   int
}

// Subscription binds an immutable workspace/session identity to a bounded queue.
// Only the coordinator enqueues updates, while holding its ordering mutex.
type Subscription struct {
	Workspace   string
	SessionID   string
	mu          sync.Mutex
	queue       chan queuedUpdate
	bytes       int
	closed      bool
	err         error
	unsubscribe func()
}

func (s *Subscription) enqueue(u Update) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return false
	}
	b, err := json.Marshal(u)
	if err != nil || s.bytes+len(b) > MaxSubscriptionBytes || len(s.queue) == cap(s.queue) {
		s.closed, s.err = true, ErrSlowSubscriber
		close(s.queue)
		return false
	}
	s.bytes += len(b)
	var immutable Update
	_ = json.Unmarshal(b, &immutable)
	s.queue <- queuedUpdate{immutable, len(b)}
	return true
}

func (s *Subscription) Next(ctx context.Context) (Update, error) {
	select {
	case <-ctx.Done():
		return Update{}, ctx.Err()
	case q, ok := <-s.queue:
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.err != nil {
			return Update{}, s.err
		}
		if !ok {
			return Update{}, io.EOF
		}
		s.bytes -= q.size
		return q.update, nil
	}
}

func (s *Subscription) Close() { s.unsubscribe() }

func (s *Subscription) closeQueue() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.closed {
		s.closed = true
		close(s.queue)
	}
}

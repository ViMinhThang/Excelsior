package workspaces

import "sync"

// State stores an optional connection-local workspace with a shared fallback.
type State struct {
	mu       sync.RWMutex
	current  string
	fallback func() string
}

func New(fallback func() string) *State {
	return &State{fallback: fallback}
}

func (s *State) Set(workspace string) {
	s.mu.Lock()
	s.current = workspace
	s.mu.Unlock()
}

func (s *State) Current() string {
	s.mu.RLock()
	workspace := s.current
	s.mu.RUnlock()
	if workspace != "" {
		return workspace
	}
	if s.fallback != nil {
		return s.fallback()
	}
	return ""
}

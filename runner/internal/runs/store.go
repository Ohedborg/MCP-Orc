package runs

import (
	"errors"
	"sync"
	"time"

	"github.com/mcp-orc/runner/internal/policy"
)

type Run struct {
	RunID          string
	PodName        string
	Namespace      string
	Status         string
	Reason         string
	CreatedAt      time.Time
	FinishedAt     *time.Time
	StoppedByAP    bool
	ImageDigest    string
	PolicyEvidence policy.Evidence
}

type Store struct {
	mu   sync.RWMutex
	runs map[string]Run
}

func NewStore() *Store {
	return &Store{runs: map[string]Run{}}
}

func (s *Store) Put(run Run) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.RunID] = run
}

func (s *Store) Get(runID string) (Run, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	run, ok := s.runs[runID]
	if !ok {
		return Run{}, errors.New("run not found")
	}
	return run, nil
}

func (s *Store) Update(runID string, fn func(r Run) Run) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	run, ok := s.runs[runID]
	if !ok {
		return errors.New("run not found")
	}
	s.runs[runID] = fn(run)
	return nil
}

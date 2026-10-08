package counter

import (
	"sync"
	"time"
)

// limiter is a small in-memory, per-key fixed-window rate limiter. It runs
// before any Redis call so abusive callers cost almost nothing. It is local to
// one serverless instance (not shared), which is enough to blunt hammering from
// a single address; a Vercel Firewall rule covers the rest.
type limiter struct {
	mu         sync.Mutex
	limit      int
	window     time.Duration
	maxEntries int
	now        func() time.Time
	hits       map[string]*window
}

type window struct {
	start time.Time
	count int
}

func newLimiter(limit int, per time.Duration) *limiter {
	return &limiter{
		limit:      limit,
		window:     per,
		maxEntries: 10000,
		now:        time.Now,
		hits:       make(map[string]*window),
	}
}

// allow reports whether key may make another request, and how long to wait if not.
func (l *limiter) allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	w, ok := l.hits[key]
	if !ok || now.Sub(w.start) >= l.window {
		if !ok && len(l.hits) >= l.maxEntries {
			l.purge(now)
		}
		l.hits[key] = &window{start: now, count: 1}
		return true, 0
	}
	if w.count >= l.limit {
		return false, l.window - now.Sub(w.start)
	}
	w.count++
	return true, 0
}

// purge drops expired windows; if the table is still full it starts over
// (failing open rather than blocking real visitors).
func (l *limiter) purge(now time.Time) {
	for k, w := range l.hits {
		if now.Sub(w.start) >= l.window {
			delete(l.hits, k)
		}
	}
	if len(l.hits) >= l.maxEntries {
		l.hits = make(map[string]*window)
	}
}

// Package account implements optional Google sign-in and the per-game leaderboards.
//
// Sign-in uses Google's server-side OAuth flow, so no Google script ever loads on the
// site. The server keeps only an anonymous ID derived from the Google account and the
// nickname the player picks: no email, name or photo is stored.
//
//	GET  /api/auth/google    -> redirect to Google
//	GET  /api/auth/callback  -> Google returns here; starts a session and redirects home
//	POST /api/auth/logout    -> ends the session
//	GET  /api/me             -> {signedIn, nickname, needsNickname, configured}
//	POST /api/me/nickname    -> {nickname}
//	POST /api/me/delete      -> removes the account and its leaderboard entries
//	POST /api/scores         -> {board, value}; keeps the player's best
//	GET  /api/leaderboard    -> ?board=game/mode&limit=25
//
// Configuration (environment variables):
//
//	REDIS_URL              redis:// or rediss:// connection string (shared with the visitor counter)
//	GOOGLE_CLIENT_ID       OAuth client ID from Google Cloud
//	GOOGLE_CLIENT_SECRET   OAuth client secret
//	SESSION_SECRET         at least 32 random characters, used to sign session cookies
//	PUBLIC_URL             optional site origin for the OAuth redirect (defaults to the request's host)
//	ALLOWED_HOSTS          optional extra hostnames allowed to POST (same-origin is always allowed)
package account

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/devground-labs/noburnout/counter"
	"github.com/redis/go-redis/v9"
)

const (
	keyPrefix     = "noburnout:"
	sessionCookie = "nb_session"
	oauthCookie   = "nb_oauth"
	sessionTTL    = 30 * 24 * time.Hour
	oauthTTL      = 10 * time.Minute
)

// Provider is the identity provider (Google in production, a fake in tests and local dev).
type Provider interface {
	Configured() bool
	AuthURL(state, redirectURI string) string
	// Exchange trades the authorization code for the account's stable subject ID.
	Exchange(ctx context.Context, code, redirectURI string) (subject string, err error)
}

// Server holds the dependencies of the account endpoints.
type Server struct {
	rdb      *redis.Client
	provider Provider
	secret   []byte
	now      func() time.Time
	ipLimit  *limiter
}

// New builds a Server. A missing SESSION_SECRET (under 32 bytes) or an unconfigured provider
// turns sign-in off; reading leaderboards keeps working.
func New(rdb *redis.Client, p Provider, secret string) *Server {
	return &Server{rdb: rdb, provider: p, secret: []byte(secret), now: time.Now, ipLimit: newLimiter(60, time.Minute)}
}

var (
	defaultOnce   sync.Once
	defaultServer *Server
)

// Default returns the production server configured from the environment.
func Default() *Server {
	defaultOnce.Do(func() {
		defaultServer = New(counter.Client(), GoogleFromEnv(), os.Getenv("SESSION_SECRET"))
	})
	return defaultServer
}

func (s *Server) authReady() bool {
	return s.rdb != nil && s.provider != nil && s.provider.Configured() && len(s.secret) >= 32
}

// Serve routes a request to its handler.
func (s *Server) Serve(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	op := opFor(r)
	if op == "" {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not found"})
		return
	}
	if ok, _ := s.ipLimit.allow(clientIP(r)); !ok {
		w.Header().Set("Retry-After", "30")
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "too many requests"})
		return
	}
	switch op {
	case "google":
		s.login(w, r)
	case "callback":
		s.callback(w, r)
	case "logout":
		s.logout(w, r)
	case "me":
		s.me(w, r)
	case "nickname":
		s.setNickname(w, r)
	case "delete":
		s.deleteAccount(w, r)
	case "scores":
		s.submitScore(w, r)
	case "leaderboard":
		s.leaderboard(w, r)
	default:
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not found"})
	}
}

// opFor reads the operation from ?op= (set by the Vercel rewrites) or, for the local dev
// server, from the path.
func opFor(r *http.Request) string {
	if op := r.URL.Query().Get("op"); op != "" {
		return op
	}
	switch strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/"), "/") {
	case "auth/google":
		return "google"
	case "auth/callback":
		return "callback"
	case "auth/logout":
		return "logout"
	case "me":
		return "me"
	case "me/nickname":
		return "nickname"
	case "me/delete":
		return "delete"
	case "scores":
		return "scores"
	case "leaderboard":
		return "leaderboard"
	}
	return ""
}

// userID is the anonymous, stable ID stored for a Google account.
func userID(subject string) string {
	sum := sha256.Sum256([]byte("noburnout|google|" + subject))
	return hex.EncodeToString(sum[:])[:24]
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// sameOrigin rejects cross-site and header-less (curl/bot) POSTs.
func sameOrigin(r *http.Request) bool {
	src := r.Header.Get("Origin")
	if src == "" {
		src = r.Header.Get("Referer")
	}
	if src == "" {
		return false
	}
	u, err := url.Parse(src)
	if err != nil || u.Host == "" {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" || host == "127.0.0.1" {
		return true
	}
	for _, h := range strings.Split(os.Getenv("ALLOWED_HOSTS"), ",") {
		if h = strings.ToLower(strings.TrimSpace(h)); h != "" && h == host {
			return true
		}
	}
	return false
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return strings.TrimSpace(ip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func isLocal(r *http.Request) bool {
	h := r.Host
	if i := strings.LastIndex(h, ":"); i >= 0 {
		h = h[:i]
	}
	return h == "localhost" || h == "127.0.0.1"
}

// limiter is a small in-memory, per-key fixed-window rate limiter.
type limiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string]*hit
}

type hit struct {
	start time.Time
	count int
}

func newLimiter(limit int, per time.Duration) *limiter {
	return &limiter{limit: limit, window: per, hits: map[string]*hit{}}
}

func (l *limiter) allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	h, ok := l.hits[key]
	if !ok || now.Sub(h.start) >= l.window {
		if len(l.hits) > 10000 {
			l.hits = map[string]*hit{}
		}
		l.hits[key] = &hit{start: now, count: 1}
		return true, 0
	}
	if h.count >= l.limit {
		return false, l.window - now.Sub(h.start)
	}
	h.count++
	return true, 0
}

// Package counter implements the visitor counter used by the landing page.
//
//	GET  /api/visitors  -> {"count": N}
//	POST /api/visitors  -> counts this visitor (once per 24h per anonymous IP hash) and returns {"count": N}
//
// Configuration (environment variables):
//
//	REDIS_URL       redis:// or rediss:// connection string (required)
//	VISITOR_SALT    optional secret used to hash IPs (defaults to a hash of REDIS_URL)
//	ALLOWED_HOSTS   optional comma-separated extra hostnames allowed to POST (same-origin is always allowed)
package counter

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	counterKey = "noburnout:visitors"
	seenPrefix = "noburnout:seen:"
	seenTTL    = 24 * time.Hour
)

// countScript atomically records a visitor: if the IP hash has not been seen
// in the last 24h it increments the counter, otherwise it just reads it.
var countScript = redis.NewScript(`
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1]) then
  return redis.call('INCR', KEYS[2])
end
return tonumber(redis.call('GET', KEYS[2]) or '0')
`)

// rateLimit caps requests per IP per minute before Redis is touched.
var rateLimit = newLimiter(20, time.Minute)

var (
	clientOnce sync.Once
	sharedRDB  *redis.Client
)

// Client returns the shared Redis client, or nil if REDIS_URL is missing or invalid.
func Client() *redis.Client {
	clientOnce.Do(func() {
		opts, err := redis.ParseURL(os.Getenv("REDIS_URL"))
		if err != nil {
			return
		}
		opts.DialTimeout = 2 * time.Second
		opts.ReadTimeout = 2 * time.Second
		opts.WriteTimeout = 2 * time.Second
		opts.MaxRetries = 1
		sharedRDB = redis.NewClient(opts)
	})
	return sharedRDB
}

// Serve handles GET and POST /api/visitors using the given Redis client.
func Serve(w http.ResponseWriter, r *http.Request, rdb *redis.Client) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	if rdb == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "counter unavailable"})
		return
	}

	ip := clientIP(r)
	if ok, retry := rateLimit.allow(ip); !ok {
		secs := int(retry.Seconds()) + 1
		w.Header().Set("Retry-After", strconv.Itoa(secs))
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "too many requests"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	switch r.Method {
	case http.MethodGet:
		n, err := rdb.Get(ctx, counterKey).Int64()
		if err != nil && err != redis.Nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": "counter unavailable"})
			return
		}
		// Allow the CDN to serve a slightly stale number to keep Redis traffic low.
		w.Header().Set("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60")
		writeJSON(w, http.StatusOK, map[string]any{"count": n})

	case http.MethodPost:
		w.Header().Set("Cache-Control", "no-store")
		if !sameOrigin(r) {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "forbidden"})
			return
		}
		key := seenPrefix + hashIP(ip)
		n, err := countScript.Run(ctx, rdb, []string{key, counterKey}, int(seenTTL.Seconds())).Int64()
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": "counter unavailable"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"count": n})

	default:
		w.Header().Set("Allow", "GET, POST")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// sameOrigin rejects cross-site and header-less (curl/bot) POSTs. It accepts the
// request's own host, any host in ALLOWED_HOSTS, and localhost for development.
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

// clientIP returns the caller's IP. On Vercel, X-Forwarded-For is set by the
// platform to the real client address.
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

// hashIP returns a keyed hash so raw IPs are never stored.
func hashIP(ip string) string {
	salt := os.Getenv("VISITOR_SALT")
	if salt == "" {
		sum := sha256.Sum256([]byte("noburnout|" + os.Getenv("REDIS_URL")))
		salt = hex.EncodeToString(sum[:])
	}
	mac := hmac.New(sha256.New, []byte(salt))
	mac.Write([]byte(ip))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}

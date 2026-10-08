package counter

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func setup(t *testing.T) *redis.Client {
	t.Helper()
	rateLimit = newLimiter(20, time.Minute) // fresh limiter for every test
	mr := miniredis.RunT(t)
	t.Setenv("REDIS_URL", "redis://"+mr.Addr())
	return redis.NewClient(&redis.Options{Addr: mr.Addr()})
}

func do(t *testing.T, rdb *redis.Client, method, ip, origin string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(method, "http://noburnout.test/api/visitors", nil)
	req.Host = "noburnout.test"
	if ip != "" {
		req.Header.Set("X-Forwarded-For", ip)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	Serve(rec, req, rdb)
	return rec.Code, strings.TrimSpace(rec.Body.String())
}

func TestCountsEachIPOncePerDay(t *testing.T) {
	rdb := setup(t)
	o := "https://noburnout.test"

	if code, body := do(t, rdb, http.MethodPost, "1.1.1.1", o); code != 200 || body != `{"count":1}` {
		t.Fatalf("first visit: %d %s", code, body)
	}
	if code, body := do(t, rdb, http.MethodPost, "1.1.1.1", o); code != 200 || body != `{"count":1}` {
		t.Fatalf("repeat visit must not increment: %d %s", code, body)
	}
	if _, body := do(t, rdb, http.MethodPost, "2.2.2.2", o); body != `{"count":2}` {
		t.Fatalf("new visitor: %s", body)
	}
	if _, body := do(t, rdb, http.MethodGet, "", ""); body != `{"count":2}` {
		t.Fatalf("get: %s", body)
	}
}

func TestRejectsCrossOriginAndHeaderlessPosts(t *testing.T) {
	rdb := setup(t)
	if code, _ := do(t, rdb, http.MethodPost, "3.3.3.3", "https://evil.example"); code != 403 {
		t.Fatalf("cross-origin should be 403, got %d", code)
	}
	if code, _ := do(t, rdb, http.MethodPost, "3.3.3.3", ""); code != 403 {
		t.Fatalf("no Origin/Referer should be 403, got %d", code)
	}
	if _, body := do(t, rdb, http.MethodGet, "", ""); body != `{"count":0}` {
		t.Fatalf("rejected posts must not count: %s", body)
	}
}

func TestAllowedHostsEnv(t *testing.T) {
	rdb := setup(t)
	t.Setenv("ALLOWED_HOSTS", "www.example.com")
	if code, _ := do(t, rdb, http.MethodPost, "4.4.4.4", "https://www.example.com"); code != 200 {
		t.Fatalf("allowed host should pass, got %d", code)
	}
}

func TestMethodsAndMissingRedis(t *testing.T) {
	rdb := setup(t)
	if code, _ := do(t, rdb, http.MethodDelete, "", ""); code != 405 {
		t.Fatalf("DELETE should be 405, got %d", code)
	}
	if code, _ := do(t, nil, http.MethodGet, "", ""); code != 503 {
		t.Fatalf("no redis should be 503, got %d", code)
	}
}

func TestRateLimitsPerIPBeforeRedis(t *testing.T) {
	rdb := setup(t)
	rateLimit = newLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		if code, _ := do(t, rdb, http.MethodGet, "5.5.5.5", ""); code != 200 {
			t.Fatalf("request %d should pass, got %d", i+1, code)
		}
	}
	code, _ := do(t, rdb, http.MethodGet, "5.5.5.5", "")
	if code != 429 {
		t.Fatalf("4th request should be 429, got %d", code)
	}
	// A different IP is unaffected.
	if code, _ := do(t, rdb, http.MethodGet, "6.6.6.6", ""); code != 200 {
		t.Fatalf("other IP should pass, got %d", code)
	}
}

func TestLimiterWindowResets(t *testing.T) {
	now := time.Unix(1000, 0)
	l := newLimiter(2, time.Minute)
	l.now = func() time.Time { return now }

	l.allow("a")
	l.allow("a")
	if ok, retry := l.allow("a"); ok || retry <= 0 {
		t.Fatalf("3rd call should be blocked with a retry delay, got ok=%v retry=%v", ok, retry)
	}
	now = now.Add(61 * time.Second)
	if ok, _ := l.allow("a"); !ok {
		t.Fatal("should be allowed again after the window passes")
	}
}

func TestLimiterStaysBounded(t *testing.T) {
	l := newLimiter(1, time.Minute)
	l.maxEntries = 50
	for i := 0; i < 500; i++ {
		l.allow(strconv.Itoa(i))
	}
	if len(l.hits) > 50 {
		t.Fatalf("limiter grew past its cap: %d", len(l.hits))
	}
}

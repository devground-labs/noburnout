// Command dev serves the API locally on :8787 so `npm run dev` (which proxies /api here)
// works without the Vercel CLI.
//
//	REDIS_URL=redis://localhost:6379 go run ./cmd/dev        # visitor counter and leaderboards
//	DEV_MEMORY=1 DEV_FAKE_LOGIN=1 go run ./cmd/dev            # no Redis or Google needed
//
// DEV_MEMORY=1      use an in-memory Redis, pre-filled with a few demo players
// DEV_FAKE_LOGIN=1  "Sign in with Google" signs you straight in as a local dev user
//
// Both are for local development only; the production function never reads them.
package main

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"github.com/devground-labs/noburnout/account"
	handler "github.com/devground-labs/noburnout/api"
	"github.com/devground-labs/noburnout/counter"
)

// devProvider skips Google: the "auth page" is the callback itself.
type devProvider struct{}

func (devProvider) Configured() bool { return true }
func (devProvider) AuthURL(state, redirectURI string) string {
	return redirectURI + "?code=dev&state=" + url.QueryEscape(state)
}
func (devProvider) Exchange(context.Context, string, string) (string, error) {
	if u := os.Getenv("DEV_USER"); u != "" {
		return "dev-" + u, nil
	}
	return "dev-user", nil
}

func main() {
	rdb := counter.Client()
	if os.Getenv("DEV_MEMORY") != "" {
		mr, err := miniredis.Run()
		if err != nil {
			log.Fatal(err)
		}
		rdb = redis.NewClient(&redis.Options{Addr: mr.Addr()})
		seedDemo(rdb)
		log.Println("using an in-memory Redis with demo players")
	}

	var acct *account.Server
	if os.Getenv("DEV_FAKE_LOGIN") != "" {
		acct = account.New(rdb, devProvider{}, "dev-secret-dev-secret-dev-secret-00")
		log.Println("fake Google login enabled (local only)")
	} else {
		acct = account.New(rdb, account.GoogleFromEnv(), os.Getenv("SESSION_SECRET"))
	}

	http.HandleFunc("/api/visitors", handler.Handler)
	for _, p := range []string{"/api/auth/", "/api/me", "/api/me/", "/api/scores", "/api/leaderboard"} {
		http.HandleFunc(p, acct.Serve)
	}
	log.Println("API dev server on http://localhost:8787")
	log.Fatal(http.ListenAndServe(":8787", nil))
}

// seedDemo fills the in-memory Redis with a few players so the leaderboards look alive.
func seedDemo(rdb *redis.Client) {
	ctx := context.Background()
	players := []struct {
		id, nick string
		pinball  float64
		rush     float64
		bit      float64
	}{
		{"demo1", "Grace H", 412300, 61400, 18432},
		{"demo2", "Linus", 389900, 64900, 15120},
		{"demo3", "Ada L", 351000, 68200, 12288},
		{"demo4", "Margaret", 244500, 72100, 9876},
		{"demo5", "Dennis R", 188800, 75500, 6144},
		{"demo6", "Ken T", 120400, 81000, 3000},
	}
	for _, p := range players {
		rdb.HSet(ctx, "noburnout:user:"+p.id, "nick", p.nick)
		rdb.Set(ctx, "noburnout:nick:"+strings.ToLower(p.nick), p.id, 0)
		rdb.ZAdd(ctx, "noburnout:lb:pinball/Classic", redis.Z{Score: p.pinball, Member: p.id})
		rdb.ZAdd(ctx, "noburnout:lb:overdrive/Rush Race", redis.Z{Score: p.rush, Member: p.id})
		rdb.ZAdd(ctx, "noburnout:lb:bit-merge/Classic", redis.Z{Score: p.bit, Member: p.id})
	}
}

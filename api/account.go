package handler

import (
	"net/http"

	"github.com/devground-labs/noburnout/account"
)

// Account serves sign-in, nicknames, scores and leaderboards (/api/auth/*, /api/me*,
// /api/scores, /api/leaderboard). vercel.json rewrites those paths to /api/account?op=...
func Account(w http.ResponseWriter, r *http.Request) {
	account.Default().Serve(w, r)
}

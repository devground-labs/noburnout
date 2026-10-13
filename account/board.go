package account

import (
	"math"
	"net/http"
	"strconv"

	"github.com/redis/go-redis/v9"
)

// A board is one leaderboard. Scores come from the browser, so each board has plausible limits;
// they stop casual tampering but cannot stop a determined cheat.
type boardCfg struct {
	Min, Max int64
	Asc      bool // lower is better (times)
}

var boards = map[string]boardCfg{
	"pinball/Classic":       {Min: 1, Max: 10_000_000},
	"cyber-runner/1 Player": {Min: 1, Max: 5_000_000},
	"overdrive/Endless":     {Min: 1, Max: 500_000},
	"overdrive/Rush Race":   {Min: 40_000, Max: 900_000, Asc: true}, // milliseconds
	"bit-merge/Classic":     {Min: 1, Max: 4_000_000},
	"bit-merge/Roomy":       {Min: 1, Max: 40_000_000},
}

func boardKey(name string) string { return keyPrefix + "lb:" + name }

func (s *Server) submitScore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if !sameOrigin(r) {
		forbidden(w)
		return
	}
	uid, ok := s.session(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "sign in first"})
		return
	}
	var body struct {
		Board string  `json:"board"`
		Value float64 `json:"value"`
	}
	if !readJSON(r, &body) || math.IsNaN(body.Value) || math.IsInf(body.Value, 0) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "bad request"})
		return
	}
	cfg, known := boards[body.Board]
	v := int64(math.Round(body.Value))
	if !known || v < cfg.Min || v > cfg.Max {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "score not accepted"})
		return
	}
	ctx := r.Context()
	if nick := s.nickname(ctx, uid); nick == "" {
		writeJSON(w, http.StatusConflict, map[string]any{"error": "choose a nickname first"})
		return
	}

	// At most 30 submissions a minute per player
	rl := keyPrefix + "rl:score:" + uid
	n, err := s.rdb.Incr(ctx, rl).Result()
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "try again"})
		return
	}
	if n == 1 {
		s.rdb.Expire(ctx, rl, 60e9)
	}
	if n > 30 {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "too many scores, slow down"})
		return
	}

	key := boardKey(body.Board)
	args := redis.ZAddArgs{Members: []redis.Z{{Score: float64(v), Member: uid}}, GT: !cfg.Asc, LT: cfg.Asc, Ch: true}
	changed, err := s.rdb.ZAddArgs(ctx, key, args).Result()
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "try again"})
		return
	}
	best, _ := s.rdb.ZScore(ctx, key, uid).Result()
	// A brand new member counts as changed; so does an improved one.
	rank := s.rankOf(r, key, uid, cfg.Asc)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "improved": changed > 0, "best": int64(best), "rank": rank})
}

func (s *Server) rankOf(r *http.Request, key, uid string, asc bool) int64 {
	var rank int64
	var err error
	if asc {
		rank, err = s.rdb.ZRank(r.Context(), key, uid).Result()
	} else {
		rank, err = s.rdb.ZRevRank(r.Context(), key, uid).Result()
	}
	if err != nil {
		return 0
	}
	return rank + 1
}

type entry struct {
	Rank     int64  `json:"rank"`
	Nickname string `json:"nickname"`
	Score    int64  `json:"score"`
	You      bool   `json:"you,omitempty"`
}

func (s *Server) leaderboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	name := r.URL.Query().Get("board")
	cfg, known := boards[name]
	if !known {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "unknown board"})
		return
	}
	limit := 25
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 50 {
		limit = l
	}
	if s.rdb == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "leaderboard unavailable"})
		return
	}
	ctx := r.Context()
	key := boardKey(name)
	var zs []redis.Z
	var err error
	if cfg.Asc {
		zs, err = s.rdb.ZRangeWithScores(ctx, key, 0, int64(limit-1)).Result()
	} else {
		zs, err = s.rdb.ZRevRangeWithScores(ctx, key, 0, int64(limit-1)).Result()
	}
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "leaderboard unavailable"})
		return
	}
	me, signedIn := s.session(r)
	// Look the nicknames up in one round trip
	pipe := s.rdb.Pipeline()
	cmds := make([]*redis.StringCmd, len(zs))
	for i, z := range zs {
		cmds[i] = pipe.HGet(ctx, userKey(z.Member.(string)), "nick")
	}
	_, _ = pipe.Exec(ctx)
	entries := make([]entry, 0, len(zs))
	for i, z := range zs {
		nick, _ := cmds[i].Result()
		if nick == "" {
			nick = "Player"
		}
		entries = append(entries, entry{Rank: int64(i) + 1, Nickname: nick, Score: int64(z.Score), You: signedIn && z.Member.(string) == me})
	}
	total, _ := s.rdb.ZCard(ctx, key).Result()
	out := map[string]any{"board": name, "entries": entries, "total": total, "unit": map[bool]string{true: "ms", false: ""}[cfg.Asc]}
	if signedIn {
		if sc, err := s.rdb.ZScore(ctx, key, me).Result(); err == nil {
			out["me"] = entry{Rank: s.rankOf(r, key, me, cfg.Asc), Score: int64(sc), You: true}
		}
		w.Header().Set("Cache-Control", "no-store")
	} else {
		w.Header().Set("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60")
	}
	writeJSON(w, http.StatusOK, out)
}

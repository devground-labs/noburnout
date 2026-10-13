package account

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"unicode"
	"unicode/utf8"
)

func getenv(k string) string { return os.Getenv(k) }

func userKey(uid string) string  { return keyPrefix + "user:" + uid }
func nickKey(nick string) string { return keyPrefix + "nick:" + strings.ToLower(nick) }

var reservedNames = []string{"admin", "administrator", "moderator", "mod", "staff", "support", "noburnout", "system", "official"}
var blocked = []string{"fuck", "shit", "cunt", "nigg", "fagg", "rape", "nazi", "hitler", "whore", "slut"}

// cleanNickname trims, collapses spaces and enforces 3-16 letters, digits, spaces, "_" and "-".
func cleanNickname(in string) (string, bool) {
	n := strings.Join(strings.Fields(strings.TrimSpace(in)), " ")
	if l := utf8.RuneCountInString(n); l < 3 || l > 16 {
		return "", false
	}
	for _, r := range n {
		if !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ' || r == '_' || r == '-') {
			return "", false
		}
	}
	flat := strings.NewReplacer(" ", "", "_", "", "-", "", "0", "o", "1", "i", "3", "e", "4", "a", "5", "s", "@", "a").Replace(strings.ToLower(n))
	for _, w := range reservedNames {
		if flat == w {
			return "", false
		}
	}
	for _, w := range blocked {
		if strings.Contains(flat, w) {
			return "", false
		}
	}
	return n, true
}

func readJSON(r *http.Request, dst any) bool {
	return json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(dst) == nil
}

func (s *Server) nickname(ctx context.Context, uid string) string {
	n, err := s.rdb.HGet(ctx, userKey(uid), "nick").Result()
	if err != nil {
		return ""
	}
	return n
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	configured := s.authReady()
	uid, ok := s.session(r)
	if !ok || !configured {
		writeJSON(w, http.StatusOK, map[string]any{"signedIn": false, "configured": configured})
		return
	}
	nick := s.nickname(r.Context(), uid)
	writeJSON(w, http.StatusOK, map[string]any{"signedIn": true, "configured": true, "nickname": nick, "needsNickname": nick == ""})
}

func (s *Server) setNickname(w http.ResponseWriter, r *http.Request) {
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
		Nickname string `json:"nickname"`
	}
	if !readJSON(r, &body) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "bad request"})
		return
	}
	nick, valid := cleanNickname(body.Nickname)
	if !valid {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "Use 3 to 16 letters, numbers, spaces, _ or - (and keep it friendly)."})
		return
	}
	ctx := r.Context()
	old := s.nickname(ctx, uid)
	// Reserve the new name (case-insensitively unique), or confirm it is already ours.
	reserved, err := s.rdb.SetNX(ctx, nickKey(nick), uid, 0).Result()
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "try again"})
		return
	}
	if !reserved {
		if owner, _ := s.rdb.Get(ctx, nickKey(nick)).Result(); owner != uid {
			writeJSON(w, http.StatusConflict, map[string]any{"error": "That nickname is taken."})
			return
		}
	}
	if err := s.rdb.HSet(ctx, userKey(uid), "nick", nick).Err(); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "try again"})
		return
	}
	if old != "" && !strings.EqualFold(old, nick) {
		if owner, _ := s.rdb.Get(ctx, nickKey(old)).Result(); owner == uid {
			s.rdb.Del(ctx, nickKey(old))
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "nickname": nick})
}

// deleteAccount removes everything stored about the player.
func (s *Server) deleteAccount(w http.ResponseWriter, r *http.Request) {
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
	ctx := r.Context()
	if nick := s.nickname(ctx, uid); nick != "" {
		if owner, _ := s.rdb.Get(ctx, nickKey(nick)).Result(); owner == uid {
			s.rdb.Del(ctx, nickKey(nick))
		}
	}
	for name := range boards {
		s.rdb.ZRem(ctx, boardKey(name), uid)
	}
	s.rdb.Del(ctx, userKey(uid))
	s.clearCookie(w, r, sessionCookie, "/")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

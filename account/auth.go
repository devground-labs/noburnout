package account

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (s *Server) redirectURI(r *http.Request) string {
	if base := strings.TrimRight(getenv("PUBLIC_URL"), "/"); base != "" {
		return base + "/api/auth/callback"
	}
	scheme := "https"
	if isLocal(r) {
		scheme = "http"
	}
	return scheme + "://" + r.Host + "/api/auth/callback"
}

// login starts the Google flow: remember a one-time state in a short-lived cookie, then redirect.
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	if !s.authReady() {
		http.Redirect(w, r, "/?auth=unavailable", http.StatusFound)
		return
	}
	nonce := randHex(16)
	tok := s.sign(claims{Nonce: nonce, Return: safeReturn(r.URL.Query().Get("return")), Exp: s.now().Add(oauthTTL).Unix()})
	s.setCookie(w, r, oauthCookie, tok, "/api", oauthTTL)
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, s.provider.AuthURL(nonce, s.redirectURI(r)), http.StatusFound)
}

// callback finishes the flow: check the state, exchange the code and start a session.
func (s *Server) callback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, "GET")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	fail := func(reason string) {
		s.clearCookie(w, r, oauthCookie, "/api")
		http.Redirect(w, r, "/?auth="+reason, http.StatusFound)
	}
	if !s.authReady() {
		fail("unavailable")
		return
	}
	q := r.URL.Query()
	if q.Get("error") != "" {
		fail("cancelled")
		return
	}
	c, err := r.Cookie(oauthCookie)
	if err != nil {
		fail("failed")
		return
	}
	cl, ok := s.verify(c.Value)
	if !ok || cl.Nonce == "" || cl.Nonce != q.Get("state") || q.Get("code") == "" {
		fail("failed")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	subject, err := s.provider.Exchange(ctx, q.Get("code"), s.redirectURI(r))
	if err != nil {
		fail("failed")
		return
	}
	uid := userID(subject)
	if err := s.rdb.HSetNX(ctx, userKey(uid), "created", s.now().Unix()).Err(); err != nil {
		fail("failed")
		return
	}
	s.clearCookie(w, r, oauthCookie, "/api")
	s.setCookie(w, r, sessionCookie, s.sign(claims{UID: uid, Exp: s.now().Add(sessionTTL).Unix()}), "/", sessionTTL)

	dest := safeReturn(cl.Return)
	sep := "?"
	if strings.Contains(dest, "?") {
		sep = "&"
	}
	http.Redirect(w, r, dest+sep+"signin="+url.QueryEscape("1"), http.StatusFound)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, "POST")
		return
	}
	if !sameOrigin(r) {
		forbidden(w)
		return
	}
	s.clearCookie(w, r, sessionCookie, "/")
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func methodNotAllowed(w http.ResponseWriter, allow string) {
	w.Header().Set("Allow", allow)
	writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
}

func forbidden(w http.ResponseWriter) {
	writeJSON(w, http.StatusForbidden, map[string]any{"error": "forbidden"})
}

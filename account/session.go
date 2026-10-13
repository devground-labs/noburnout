package account

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// claims is the signed payload of both the session cookie and the short-lived OAuth cookie.
type claims struct {
	UID    string `json:"u,omitempty"`
	Nonce  string `json:"n,omitempty"`
	Return string `json:"r,omitempty"`
	Exp    int64  `json:"e"`
}

func (s *Server) sign(c claims) string {
	b, _ := json.Marshal(c)
	p := base64.RawURLEncoding.EncodeToString(b)
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(p))
	return p + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) verify(token string) (claims, bool) {
	var c claims
	parts := strings.Split(token, ".")
	if len(parts) != 2 || len(s.secret) < 32 {
		return c, false
	}
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(parts[0]))
	want := mac.Sum(nil)
	got, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(got, want) {
		return c, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || json.Unmarshal(raw, &c) != nil {
		return c, false
	}
	if c.Exp < s.now().Unix() {
		return c, false
	}
	return c, true
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Server) setCookie(w http.ResponseWriter, r *http.Request, name, value, path string, ttl time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     path,
		MaxAge:   int(ttl.Seconds()),
		HttpOnly: true,
		Secure:   !isLocal(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearCookie(w http.ResponseWriter, r *http.Request, name, path string) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: path, MaxAge: -1, HttpOnly: true, Secure: !isLocal(r), SameSite: http.SameSiteLaxMode})
}

// session returns the signed-in user's ID, if the request carries a valid session.
func (s *Server) session(r *http.Request) (string, bool) {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return "", false
	}
	cl, ok := s.verify(c.Value)
	if !ok || cl.UID == "" {
		return "", false
	}
	return cl.UID, true
}

// safeReturn only allows same-site relative paths, so the callback can't be used as an open redirect.
func safeReturn(p string) string {
	if p == "" || !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") || strings.Contains(p, "\\") || strings.ContainsAny(p, "\r\n") {
		return "/"
	}
	return p
}

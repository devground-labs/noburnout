package account

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

type fakeProvider struct{ subject string }

func (f *fakeProvider) Configured() bool { return true }
func (f *fakeProvider) AuthURL(state, redirect string) string {
	return "https://accounts.example/auth?state=" + url.QueryEscape(state) + "&redirect_uri=" + url.QueryEscape(redirect)
}
func (f *fakeProvider) Exchange(_ context.Context, code, _ string) (string, error) {
	if code == "bad" {
		return "", errors.New("nope")
	}
	return f.subject, nil
}

const secret = "0123456789abcdef0123456789abcdef"

func newServer(t *testing.T) (*Server, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { rdb.Close() })
	return New(rdb, &fakeProvider{subject: "sub-1"}, secret), mr
}

func do(s *Server, method, path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "http://localhost:8787"+path, strings.NewReader(body))
	r.RemoteAddr = "10.0.0.1:1234"
	if method == http.MethodPost {
		r.Header.Set("Origin", "http://localhost:8787")
		r.Header.Set("Content-Type", "application/json")
	}
	for _, c := range cookies {
		r.AddCookie(c)
	}
	w := httptest.NewRecorder()
	s.Serve(w, r)
	return w
}

func cookieNamed(w *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range w.Result().Cookies() {
		if c.Name == name && c.MaxAge >= 0 && c.Value != "" {
			return c
		}
	}
	return nil
}

// signIn runs the whole fake OAuth round trip and returns the session cookie.
func signIn(t *testing.T, s *Server, ret string) *http.Cookie {
	t.Helper()
	w := do(s, "GET", "/api/auth/google?return="+url.QueryEscape(ret), "")
	if w.Code != http.StatusFound {
		t.Fatalf("login status %d", w.Code)
	}
	oauth := cookieNamed(w, oauthCookie)
	if oauth == nil {
		t.Fatal("no oauth cookie")
	}
	loc, _ := url.Parse(w.Header().Get("Location"))
	state := loc.Query().Get("state")
	cb := do(s, "GET", "/api/auth/callback?code=ok&state="+url.QueryEscape(state), "", oauth)
	if cb.Code != http.StatusFound {
		t.Fatalf("callback status %d", cb.Code)
	}
	sess := cookieNamed(cb, sessionCookie)
	if sess == nil {
		t.Fatalf("no session cookie; redirected to %s", cb.Header().Get("Location"))
	}
	if !sess.HttpOnly || sess.SameSite != http.SameSiteLaxMode {
		t.Fatal("session cookie must be HttpOnly and SameSite=Lax")
	}
	return sess
}

func TestSignInThenNickname(t *testing.T) {
	s, _ := newServer(t)
	sess := signIn(t, s, "/")

	var me map[string]any
	json.Unmarshal(do(s, "GET", "/api/me", "", sess).Body.Bytes(), &me)
	if me["signedIn"] != true || me["needsNickname"] != true {
		t.Fatalf("expected signed in and needing a nickname, got %v", me)
	}
	if w := do(s, "POST", "/api/me/nickname", `{"nickname":"Ada Lovelace"}`, sess); w.Code != 200 {
		t.Fatalf("nickname: %d %s", w.Code, w.Body)
	}
	json.Unmarshal(do(s, "GET", "/api/me", "", sess).Body.Bytes(), &me)
	if me["nickname"] != "Ada Lovelace" || me["needsNickname"] != false {
		t.Fatalf("got %v", me)
	}
}

func TestSignedOutAndTampered(t *testing.T) {
	s, _ := newServer(t)
	var me map[string]any
	json.Unmarshal(do(s, "GET", "/api/me", "").Body.Bytes(), &me)
	if me["signedIn"] != false {
		t.Fatalf("got %v", me)
	}
	sess := signIn(t, s, "/")
	bad := &http.Cookie{Name: sessionCookie, Value: sess.Value[:len(sess.Value)-2] + "xx"}
	json.Unmarshal(do(s, "GET", "/api/me", "", bad).Body.Bytes(), &me)
	if me["signedIn"] != false {
		t.Fatal("a tampered cookie must not sign anyone in")
	}
	if w := do(s, "POST", "/api/scores", `{"board":"pinball/Classic","value":10}`); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous score should be 401, got %d", w.Code)
	}
}

func TestCallbackRejectsBadStateAndFailedExchange(t *testing.T) {
	s, _ := newServer(t)
	w := do(s, "GET", "/api/auth/google", "")
	oauth := cookieNamed(w, oauthCookie)
	cb := do(s, "GET", "/api/auth/callback?code=ok&state=wrong", "", oauth)
	if cookieNamed(cb, sessionCookie) != nil || !strings.Contains(cb.Header().Get("Location"), "auth=failed") {
		t.Fatal("a wrong state must fail")
	}
	loc, _ := url.Parse(w.Header().Get("Location"))
	cb = do(s, "GET", "/api/auth/callback?code=bad&state="+loc.Query().Get("state"), "", oauth)
	if cookieNamed(cb, sessionCookie) != nil {
		t.Fatal("a failed exchange must not sign anyone in")
	}
	if cb := do(s, "GET", "/api/auth/callback?code=ok&state=x", ""); cookieNamed(cb, sessionCookie) != nil {
		t.Fatal("a callback without the oauth cookie must fail")
	}
}

func TestReturnPathCannotBeAnOpenRedirect(t *testing.T) {
	for in, want := range map[string]string{"/": "/", "/games?x=1": "/games?x=1", "//evil.com": "/", "https://evil.com": "/", "/\\evil.com": "/", "": "/"} {
		if got := safeReturn(in); got != want {
			t.Errorf("safeReturn(%q)=%q want %q", in, got, want)
		}
	}
}

func TestNicknameRules(t *testing.T) {
	for _, ok := range []string{"Ada", "Ada Lovelace", "player_1", "Zoë-2"} {
		if _, valid := cleanNickname(ok); !valid {
			t.Errorf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "ab", "this name is way too long", "<script>", "a@b.c", "Admin", "n0burn0ut", "ADMIN", "fuck you"} {
		if _, valid := cleanNickname(bad); valid {
			t.Errorf("%q should be rejected", bad)
		}
	}
}

func TestNicknamesAreUniqueAndReleasedOnChange(t *testing.T) {
	s, _ := newServer(t)
	a := signIn(t, s, "/")
	do(s, "POST", "/api/me/nickname", `{"nickname":"Pilot"}`, a)

	s.provider = &fakeProvider{subject: "sub-2"}
	b := signIn(t, s, "/")
	if w := do(s, "POST", "/api/me/nickname", `{"nickname":"pilot"}`, b); w.Code != http.StatusConflict {
		t.Fatalf("a taken name (any case) should conflict, got %d", w.Code)
	}
	s.provider = &fakeProvider{subject: "sub-1"}
	a = signIn(t, s, "/")
	do(s, "POST", "/api/me/nickname", `{"nickname":"Navigator"}`, a)
	s.provider = &fakeProvider{subject: "sub-2"}
	b = signIn(t, s, "/")
	if w := do(s, "POST", "/api/me/nickname", `{"nickname":"Pilot"}`, b); w.Code != 200 {
		t.Fatalf("the old name should be free again, got %d", w.Code)
	}
}

func TestScoresKeepTheBestAndRank(t *testing.T) {
	s, _ := newServer(t)
	a := signIn(t, s, "/")
	do(s, "POST", "/api/me/nickname", `{"nickname":"Ada"}`, a)
	s.provider = &fakeProvider{subject: "sub-2"}
	b := signIn(t, s, "/")
	do(s, "POST", "/api/me/nickname", `{"nickname":"Bob"}`, b)

	submit := func(c *http.Cookie, board string, v int) map[string]any {
		var out map[string]any
		w := do(s, "POST", "/api/scores", `{"board":"`+board+`","value":`+itoa(v)+`}`, c)
		if w.Code != 200 {
			t.Fatalf("score %d: %d %s", v, w.Code, w.Body)
		}
		json.Unmarshal(w.Body.Bytes(), &out)
		return out
	}
	submit(a, "pinball/Classic", 500)
	if r := submit(a, "pinball/Classic", 300); r["improved"] != false || r["best"] != float64(500) {
		t.Fatalf("a worse score must not replace the best: %v", r)
	}
	if r := submit(b, "pinball/Classic", 900); r["rank"] != float64(1) {
		t.Fatalf("bob should lead: %v", r)
	}

	var lb struct {
		Entries []entry        `json:"entries"`
		Me      map[string]any `json:"me"`
	}
	json.Unmarshal(do(s, "GET", "/api/leaderboard?board="+url.QueryEscape("pinball/Classic"), "", a).Body.Bytes(), &lb)
	if len(lb.Entries) != 2 || lb.Entries[0].Nickname != "Bob" || lb.Entries[1].Nickname != "Ada" || !lb.Entries[1].You {
		t.Fatalf("unexpected board: %+v", lb)
	}
	if lb.Me["rank"] != float64(2) {
		t.Fatalf("ada should be second: %v", lb.Me)
	}
}

func TestTimeBoardPrefersFasterAndRejectsImplausible(t *testing.T) {
	s, _ := newServer(t)
	a := signIn(t, s, "/")
	do(s, "POST", "/api/me/nickname", `{"nickname":"Ada"}`, a)
	post := func(v int) *httptest.ResponseRecorder {
		return do(s, "POST", "/api/scores", `{"board":"overdrive/Rush Race","value":`+itoa(v)+`}`, a)
	}
	if post(70_000).Code != 200 {
		t.Fatal("70s should be accepted")
	}
	var r map[string]any
	json.Unmarshal(post(60_000).Body.Bytes(), &r)
	if r["best"] != float64(60_000) {
		t.Fatalf("a faster time should win: %v", r)
	}
	json.Unmarshal(post(80_000).Body.Bytes(), &r)
	if r["best"] != float64(60_000) {
		t.Fatalf("a slower time must not replace it: %v", r)
	}
	if post(5_000).Code != http.StatusUnprocessableEntity {
		t.Fatal("an impossibly fast time must be rejected")
	}
	if w := do(s, "POST", "/api/scores", `{"board":"pinball/Classic","value":99999999999}`, a); w.Code != http.StatusUnprocessableEntity {
		t.Fatal("an absurd score must be rejected")
	}
	if w := do(s, "POST", "/api/scores", `{"board":"nope/none","value":5}`, a); w.Code != http.StatusUnprocessableEntity {
		t.Fatal("an unknown board must be rejected")
	}
}

func TestScoreNeedsNicknameAndSameOrigin(t *testing.T) {
	s, _ := newServer(t)
	a := signIn(t, s, "/")
	if w := do(s, "POST", "/api/scores", `{"board":"pinball/Classic","value":5}`, a); w.Code != http.StatusConflict {
		t.Fatalf("no nickname yet: want 409, got %d", w.Code)
	}
	do(s, "POST", "/api/me/nickname", `{"nickname":"Ada"}`, a)
	r := httptest.NewRequest("POST", "http://localhost:8787/api/scores", strings.NewReader(`{"board":"pinball/Classic","value":5}`))
	r.Header.Set("Origin", "https://evil.example")
	r.AddCookie(a)
	r.RemoteAddr = "10.0.0.2:1"
	w := httptest.NewRecorder()
	s.Serve(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("a cross-site POST must be forbidden, got %d", w.Code)
	}
}

func TestScoreRateLimit(t *testing.T) {
	s, _ := newServer(t)
	a := signIn(t, s, "/")
	do(s, "POST", "/api/me/nickname", `{"nickname":"Ada"}`, a)
	s.ipLimit = newLimiter(1000, time.Minute)
	var last int
	for i := 0; i < 35; i++ {
		last = do(s, "POST", "/api/scores", `{"board":"pinball/Classic","value":`+itoa(i+1)+`}`, a).Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("the 35th score in a minute should be limited, got %d", last)
	}
}

func TestDeleteAccountRemovesEverything(t *testing.T) {
	s, mr := newServer(t)
	a := signIn(t, s, "/")
	do(s, "POST", "/api/me/nickname", `{"nickname":"Ada"}`, a)
	do(s, "POST", "/api/scores", `{"board":"pinball/Classic","value":500}`, a)
	if w := do(s, "POST", "/api/me/delete", `{}`, a); w.Code != 200 {
		t.Fatalf("delete: %d", w.Code)
	}
	for _, k := range mr.Keys() {
		if strings.Contains(k, "user:") || strings.Contains(k, "nick:") {
			t.Fatalf("leftover key %s", k)
		}
	}
	var lb struct{ Entries []entry }
	json.Unmarshal(do(s, "GET", "/api/leaderboard?board="+url.QueryEscape("pinball/Classic"), "").Body.Bytes(), &lb)
	if len(lb.Entries) != 0 {
		t.Fatalf("the board should be empty, got %+v", lb.Entries)
	}
}

func TestUnconfiguredServerKeepsLeaderboardsReadable(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { rdb.Close() })
	s := New(rdb, &unconfigured{}, "")
	var me map[string]any
	json.Unmarshal(do(s, "GET", "/api/me", "").Body.Bytes(), &me)
	if me["configured"] != false {
		t.Fatalf("got %v", me)
	}
	if w := do(s, "GET", "/api/auth/google", ""); w.Code != http.StatusFound || !strings.Contains(w.Header().Get("Location"), "auth=unavailable") {
		t.Fatalf("sign-in should degrade gracefully, got %d %s", w.Code, w.Header().Get("Location"))
	}
	if w := do(s, "GET", "/api/leaderboard?board="+url.QueryEscape("pinball/Classic"), ""); w.Code != 200 {
		t.Fatalf("reading boards should still work, got %d", w.Code)
	}
}

type unconfigured struct{}

func (unconfigured) Configured() bool              { return false }
func (unconfigured) AuthURL(string, string) string { return "" }
func (unconfigured) Exchange(context.Context, string, string) (string, error) {
	return "", errors.New("off")
}

func TestIDTokenValidation(t *testing.T) {
	mk := func(payload string) string {
		return "h." + base64.RawURLEncoding.EncodeToString([]byte(payload)) + ".s"
	}
	now := time.Unix(1_000_000, 0)
	good := `{"iss":"https://accounts.google.com","aud":"cid","sub":"123","exp":2000000}`
	if sub, err := subjectFromIDToken(mk(good), "cid", now); err != nil || sub != "123" {
		t.Fatalf("good token: %v %v", sub, err)
	}
	for name, p := range map[string]string{
		"wrong audience": `{"iss":"https://accounts.google.com","aud":"other","sub":"1","exp":2000000}`,
		"wrong issuer":   `{"iss":"https://evil.com","aud":"cid","sub":"1","exp":2000000}`,
		"expired":        `{"iss":"https://accounts.google.com","aud":"cid","sub":"1","exp":10}`,
		"no subject":     `{"iss":"https://accounts.google.com","aud":"cid","exp":2000000}`,
	} {
		if _, err := subjectFromIDToken(mk(p), "cid", now); err == nil {
			t.Errorf("%s should be rejected", name)
		}
	}
}

func itoa(n int) string { b, _ := json.Marshal(n); return string(b) }

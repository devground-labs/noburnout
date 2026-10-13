package account

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type google struct {
	clientID, clientSecret string
	hc                     *http.Client
}

// GoogleFromEnv builds the Google provider from GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
func GoogleFromEnv() Provider {
	return &google{
		clientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		clientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		hc:           &http.Client{Timeout: 6 * time.Second},
	}
}

func (g *google) Configured() bool { return g.clientID != "" && g.clientSecret != "" }

func (g *google) AuthURL(state, redirectURI string) string {
	q := url.Values{}
	q.Set("client_id", g.clientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("response_type", "code")
	q.Set("scope", "openid") // only the stable account ID: no email, name or photo
	q.Set("state", state)
	q.Set("prompt", "select_account")
	return "https://accounts.google.com/o/oauth2/v2/auth?" + q.Encode()
}

func (g *google) Exchange(ctx context.Context, code, redirectURI string) (string, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", g.clientID)
	form.Set("client_secret", g.clientSecret)
	form.Set("redirect_uri", redirectURI)
	form.Set("grant_type", "authorization_code")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := g.hc.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", errors.New("google token exchange failed")
	}
	var tok struct {
		IDToken string `json:"id_token"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&tok); err != nil {
		return "", err
	}
	return subjectFromIDToken(tok.IDToken, g.clientID, time.Now())
}

// subjectFromIDToken reads the subject from the ID token. The token came straight from Google over TLS
// in the back-channel exchange above, so (as the OpenID spec allows) we validate its claims rather than
// its signature.
func subjectFromIDToken(idToken, clientID string, now time.Time) (string, error) {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return "", errors.New("malformed id_token")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	var c struct {
		Iss string `json:"iss"`
		Aud string `json:"aud"`
		Sub string `json:"sub"`
		Exp int64  `json:"exp"`
	}
	if err := json.Unmarshal(raw, &c); err != nil {
		return "", err
	}
	if c.Iss != "https://accounts.google.com" && c.Iss != "accounts.google.com" {
		return "", errors.New("unexpected issuer")
	}
	if c.Aud != clientID {
		return "", errors.New("unexpected audience")
	}
	if c.Exp < now.Unix() {
		return "", errors.New("expired id_token")
	}
	if c.Sub == "" {
		return "", errors.New("missing subject")
	}
	return c.Sub, nil
}

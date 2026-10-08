// Command dev serves the visitor counter locally on :8787 so `npm run dev`
// (which proxies /api here) works without the Vercel CLI.
//
//	REDIS_URL=redis://localhost:6379 go run ./cmd/dev
package main

import (
	"log"
	"net/http"

	handler "github.com/devground-labs/noburnout/api"
)

func main() {
	http.HandleFunc("/api/visitors", handler.Handler)
	log.Println("visitor counter dev server on http://localhost:8787")
	log.Fatal(http.ListenAndServe(":8787", nil))
}

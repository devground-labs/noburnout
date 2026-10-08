// Package handler is the Vercel serverless entry point for /api/visitors.
// The logic lives in the counter package so it can be tested and so that api/
// contains only the function entry point.
package handler

import (
	"net/http"

	"github.com/devground-labs/noburnout/counter"
)

// Handler serves GET and POST /api/visitors.
func Handler(w http.ResponseWriter, r *http.Request) {
	counter.Serve(w, r, counter.Client())
}

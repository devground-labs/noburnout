import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: Number(process.env.PORT) || 5173,
    open: false,
    // Local visitor-counter API: run `go run ./cmd/dev` (needs REDIS_URL)
    // Keep the browser's Host header so sign-in redirects come back to the site, not to :8787
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});

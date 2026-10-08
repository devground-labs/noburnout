import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: Number(process.env.PORT) || 5173,
    open: false,
    // Local visitor-counter API: run `go run ./cmd/dev` (needs REDIS_URL)
    proxy: { '/api': 'http://localhost:8787' }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});

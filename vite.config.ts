import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// CAPOTBOOKS — Cloudflare Pages build config
// THE FIX: base was '/capotbooks/' (subpath deploy, e.g. GitHub Pages project site).
// On capotbooks.pages.dev the app lives at the domain ROOT, so base must be '/'.
// With '/capotbooks/', index.html requested /capotbooks/assets/*.js which 404'd
// (SPA fallback served HTML instead of JS) -> blank white page.
export default defineConfig({
  base: '/', // <-- changed from '/capotbooks/'
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Matches the chunk names observed in your build:
        // react-vendor-*.js, motion-vendor-*.js, supabase-vendor-*.js
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'motion-vendor': ['framer-motion'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})

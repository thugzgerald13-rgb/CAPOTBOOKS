import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
export default defineConfig({
  base: '/', // ✅ already fixed
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // ✅ fixes @/lib/utils
    },
  },
  build: {
    // your existing chunk splitting
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'motion-vendor': ['framer-motion'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
  },
})

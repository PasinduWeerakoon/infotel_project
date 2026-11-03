import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the APIs are reached through this server, exactly like CloudFront does in AWS:
// same origin, so the sign-in cookie just works and no CORS is needed.
const PLATFORM = 'http://localhost:4000';
const HUNT = 'http://localhost:4002';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/auth': PLATFORM,
      '/platform': PLATFORM,
      '/hunt': HUNT,
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Libraries change rarely, so they get their own long-cached file
        manualChunks: (id) =>
          id.includes('node_modules') && !id.includes('canvas-confetti') ? 'vendor' : undefined,
      },
    },
  },
});

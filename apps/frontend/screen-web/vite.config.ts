import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Development proxies, like CloudFront in AWS. The stall screen WebSocket goes to the Games API.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5176,
    strictPort: true,
    proxy: {
      '/platform': 'http://localhost:4000',
      '/hunt': 'http://localhost:4002',
      '/screens': { target: 'ws://localhost:4001', ws: true },
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes('node_modules') && !id.includes('canvas-confetti') ? 'vendor' : undefined,
      },
    },
  },
});

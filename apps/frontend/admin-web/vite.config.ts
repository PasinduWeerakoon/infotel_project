import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Development proxies, like CloudFront in AWS: each admin API path goes to its own service.
// More specific paths come first.
const PLATFORM = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/admin/v1/games': 'http://localhost:4001',
      '/admin/v1/hunt': 'http://localhost:4002',
      '/admin/v1': PLATFORM,
      '/platform': PLATFORM,
      '/_local/assets': PLATFORM,
    },
  },
  build: {
    target: 'es2022',
    // Ant Design is one large, long-cached file. Staff use laptops, so this is acceptable here
    // (visitor apps stay small and do not use Ant Design).
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) return 'antd';
          return 'vendor';
        },
      },
    },
  },
});

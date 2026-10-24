import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_BACKEND_URL || 'http://127.0.0.1:7860';

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          configure: (proxy) => {
            // The dev server acts as a same-origin gateway; bypass the backend's cross-origin
            // allowlist for proxied browser calls while preserving cookie/CSRF behavior.
            proxy.on('proxyReq', (proxyReq) => { proxyReq.removeHeader('origin'); });
          },
        },
      },
    },
  };
});

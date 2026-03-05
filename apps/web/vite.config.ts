import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

const webPort = Number(process.env.VITE_PORT || 5173);
const webHost = process.env.VITE_HOST || '0.0.0.0';
const apiPort = Number(process.env.API_PORT || 3300);
const apiProxyTarget = process.env.API_PROXY_TARGET || `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/antd/') || id.includes('/@ant-design/')) {
            return 'antd';
          }
          return undefined;
        }
      }
    }
  },
  server: {
    host: webHost,
    port: webPort,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  }
});

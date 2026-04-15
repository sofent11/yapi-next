import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 1420
  },
  build: {
    target: 'es2022',
    minify: false
  }
});

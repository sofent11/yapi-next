import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

const repoRoot = new URL('../..', import.meta.url).pathname;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@yapi-debugger/core': new URL('../../packages/debugger-core/src/index.ts', import.meta.url).pathname,
      '@yapi-debugger/importers': new URL('../../packages/debugger-importers/src/index.ts', import.meta.url).pathname,
      '@yapi-debugger/schema': new URL('../../packages/debugger-schema/src/index.ts', import.meta.url).pathname
    }
  },
  server: {
    host: '0.0.0.0',
    port: 1420,
    fs: {
      allow: [repoRoot]
    }
  },
  optimizeDeps: {
    exclude: ['@yapi-debugger/core', '@yapi-debugger/importers', '@yapi-debugger/schema']
  },
  build: {
    target: 'es2022',
    minify: false
  }
});

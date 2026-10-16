import { defineConfig } from 'vite';

// No operator-facing dev/start command until issue #4 implements the HTTPS proxy.
export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true, hmr: false },
  preview: { host: '127.0.0.1', strictPort: true },
  build: { sourcemap: false },
});

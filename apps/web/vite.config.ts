import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  envDir: false,
  envPrefix: [],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: false,
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        fileURLToPath(
          new URL('../../packages/shared-contracts/dist', import.meta.url),
        ),
      ],
      deny: ['.env', '.env.*', '**/.git/**', '*.{pem,key,pfx,p12,crt,cer}'],
    },
  },
  preview: { host: '127.0.0.1', strictPort: true },
  build: { sourcemap: false },
});

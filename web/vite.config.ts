import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

const hub = process.env.HUB_URL ?? 'http://127.0.0.1:7681';

export default defineConfig({
  plugins: [preact()],
  server: {
    host: true,
    fs: { allow: ['..'] },
    proxy: {
      '/api': hub,
      '/ws': { target: hub.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: { target: 'es2022', sourcemap: true },
});

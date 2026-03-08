import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  build: { target: 'es2022' },
  server: {
    allowedHosts: ['localhost', '127.0.0.1'],
    fs: { allow: [resolve(__dirname, '../..')] },
  },
});

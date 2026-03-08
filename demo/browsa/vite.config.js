import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  build: { target: 'es2022' },
  server: {
    allowedHosts: true,
    fs: { allow: [resolve(__dirname, '../..')] },
  },
});

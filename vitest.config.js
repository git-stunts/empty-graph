import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      '**/*.{test,spec}.?(c|m)[jt]s?(x)',
      '**/benchmark/*.benchmark.js',
    ],
    testTimeout: 60000, // 60s timeout for benchmark tests
    server: {
      deps: {
        // Native C++ addons must not be transformed by Vite's pipeline.
        external: ['roaring'],
      },
    },
  },
});

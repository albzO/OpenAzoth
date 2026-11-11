import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  // relative base so the build works both at the domain root and under /<repo>/ on GitHub Pages
  base: './',
  plugins: [preact()],
  server: { host: '127.0.0.1', port: 5173 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});

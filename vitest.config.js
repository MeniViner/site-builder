import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  test: {
    environment: 'jsdom',
    exclude: [
      ...configDefaults.exclude,
      '.tmp-verify/**',
      '.site-builder-patch-backup/**',
      'dist/**',
      'dist-universal/**',
      '.tmp-build/**',
      'scripts/server-colocation/**',
      // Playwright owns e2e/: those specs import @playwright/test and must not
      // be collected by vitest. Run them with `npm run test:e2e`.
      'e2e/**',
    ],
    globals: true,
    setupFiles: ['./src/test/setupTests.js'],
  },
});

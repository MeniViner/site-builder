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
    ],
    globals: true,
    setupFiles: ['./src/test/setupTests.js'],
  },
});

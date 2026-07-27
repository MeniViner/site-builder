import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  test: {
    environment: 'jsdom',
    exclude: ['.tmp-verify/**', 'dist/**', 'node_modules/**'],
    globals: true,
    setupFiles: ['./src/test/setupTests.js'],
  },
});

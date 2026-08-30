import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devAiVitePlugin } from './scripts/dev/viteDevAiPlugin.mjs'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  // devAiVitePlugin declares `apply: 'serve'`, so the DEV-only AI gateway is
  // attached to the development server and is absent from every production build.
  plugins: [react(), devAiVitePlugin()],
})

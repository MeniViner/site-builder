import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { localFileBridgePlugin } from './scripts/dev/localFileBridge.js'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), localFileBridgePlugin()],
})

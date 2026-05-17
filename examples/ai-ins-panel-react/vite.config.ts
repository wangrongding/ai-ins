import aiIns from '@ai-ins/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    aiIns({
      root: resolve(__dirname, '../..'),
    }),
    react(),
  ],
  server: {
    open: true,
    port: 5175,
  },
})

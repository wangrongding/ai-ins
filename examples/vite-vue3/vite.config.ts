import aiIns from '@ai-ins/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [aiIns(), vue()],
  server: {
    port: 5174,
    open: true,
  },
})
import aiIns from '@ai-ins/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    aiIns(), // 注册 AI Ins 插件
    react(),
  ],
  server: {
    open: true,
    port: 5173,
  },
})

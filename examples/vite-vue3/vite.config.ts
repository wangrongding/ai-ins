import agentDev from '@agent-dev/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [agentDev(), vue()],
  server: {
    port: 5174,
    open: true,
  },
})
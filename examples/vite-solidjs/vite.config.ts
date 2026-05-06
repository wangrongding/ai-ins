import aiIns from '@ai-ins/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [
    aiIns(),
    solid(),
  ],
  server: {
    open: true,
    port: 5175,
  },
})

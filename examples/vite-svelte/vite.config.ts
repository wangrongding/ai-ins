import aiIns from '@ai-ins/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    aiIns(),
    svelte(),
  ],
  server: {
    open: true,
    port: 5176,
  },
})

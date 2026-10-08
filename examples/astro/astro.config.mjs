import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import aiIns from '@ai-ins/astro'

export default defineConfig({
  integrations: [react(), aiIns()],
})

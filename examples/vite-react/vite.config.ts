import agentDev from '@agent-dev/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [agentDev(), react()] })

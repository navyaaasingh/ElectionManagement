import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig(() => {
  // GitHub Pages serves the app under /<repo>/, so allow CI to set BASE_PATH.
  // Local dev/default remains '/'.
  const base = process.env.BASE_PATH || '/'

  return {
    base,
    plugins: [react()],
    server: {
      host: true,
      port: 3001,
    },
  }
})

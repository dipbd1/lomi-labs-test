import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { holdApiPlugin } from './hold-for-api.mjs'

const apiOrigin = 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [holdApiPlugin(apiOrigin), react()],
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: apiOrigin,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
    },
  },
})

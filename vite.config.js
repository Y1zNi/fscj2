import { createRequire } from 'module'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const { mountSocialApiRoutes } = require('./server/socialApiRoutes.cjs')

function socialApiPlugin() {
  return {
    name: 'social-detail-api',
    configureServer(server) {
      mountSocialApiRoutes((route, handler) => {
        server.middlewares.use(route, handler)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), socialApiPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3789,
    open: true,
  },
})

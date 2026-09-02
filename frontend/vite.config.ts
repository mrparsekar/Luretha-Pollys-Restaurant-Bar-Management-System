import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * The API is a separate process on another port, and the session is an httpOnly
 * cookie. Proxying /api through the dev server keeps the browser on one origin,
 * so the cookie is same-site and no CORS or SameSite=None juggling is needed
 * while developing. In production both sit behind one domain and the proxy is
 * replaced by the host's own routing.
 */
export default defineConfig(({ mode }) => {
  // '.' rather than process.cwd(): this keeps @types/node out of the project, so
  // nothing in src/ can reach for a Node global by accident.
  const env = loadEnv(mode, '.', '')
  const target = env.API_PROXY_TARGET || 'http://localhost:4001'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // Phones on the same Wi-Fi need to reach this during a floor test.
      host: true,
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
    preview: { port: 5173, proxy: { '/api': { target, changeOrigin: true } } },
    build: { outDir: 'dist', sourcemap: true },
  }
})

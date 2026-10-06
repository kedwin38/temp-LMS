import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import legacy from '@vitejs/plugin-legacy'
import { defineConfig } from 'vite'

export default defineConfig({
  // The default build ships a single <script type="module"> with no fallback.
  // That's a blank, unexplained white screen for any browser/proxy that can't run
  // ES modules -- which includes a lot of real traffic in low-bandwidth markets
  // (Opera Mini, UC Browser's data-saving modes, older/budget Android devices),
  // not just ancient desktop browsers. This plugin adds a transpiled, polyfilled
  // fallback bundle those clients load instead.
  plugins: [
    react(),
    tailwindcss(),
    legacy({ targets: ['defaults', 'not IE 11', 'Android >= 4.4', 'iOS >= 9'] }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})

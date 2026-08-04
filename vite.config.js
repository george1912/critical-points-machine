import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// GitHub Pages project sites need `/repo-name/`. Electron/local builds keep `./`.
export default defineConfig({
  base: process.env.VITE_BASE || './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        bug: resolve(__dirname, 'bug.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
})

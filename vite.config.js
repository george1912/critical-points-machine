import { defineConfig } from 'vite'

// GitHub Pages project sites need `/repo-name/`. Electron/local builds keep `./`.
export default defineConfig({
  base: process.env.VITE_BASE || './',
})

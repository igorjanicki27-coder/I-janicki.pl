import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  envDir: __dirname,
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer/src'),
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  plugins: [vue()],
  build: {
    outDir: path.resolve(__dirname, 'dist-web'),
    emptyOutDir: true
  }
})

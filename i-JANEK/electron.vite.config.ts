import path from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const uuidCjsEntry = path.resolve(__dirname, 'node_modules/uuid/dist/cjs/index.js')

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        uuid: uuidCjsEntry
      }
    },
    plugins: [externalizeDepsPlugin({ exclude: ['uuid'] })]
  },
  preload: {
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        uuid: uuidCjsEntry
      }
    },
    plugins: [externalizeDepsPlugin({ exclude: ['uuid'] })]
  },
  renderer: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer/src'),
        '@shared': path.resolve(__dirname, 'src/shared')
      }
    },
    plugins: [vue()]
  }
})

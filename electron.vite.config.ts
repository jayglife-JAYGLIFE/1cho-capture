import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          overlay: resolve(__dirname, 'src/preload/overlay.ts'),
          editor: resolve(__dirname, 'src/preload/editor.ts'),
          settings: resolve(__dirname, 'src/preload/settings.ts'),
          toolbar: resolve(__dirname, 'src/preload/toolbar.ts'),
          scrollController: resolve(__dirname, 'src/preload/scrollController.ts'),
          captureBox: resolve(__dirname, 'src/preload/captureBox.ts'),
          delayBadge: resolve(__dirname, 'src/preload/delayBadge.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          overlay: resolve(__dirname, 'src/renderer/overlay/index.html'),
          editor: resolve(__dirname, 'src/renderer/editor/index.html'),
          settings: resolve(__dirname, 'src/renderer/settings/index.html'),
          toolbar: resolve(__dirname, 'src/renderer/toolbar/index.html'),
          scrollController: resolve(__dirname, 'src/renderer/scrollController/index.html'),
          captureBox: resolve(__dirname, 'src/renderer/captureBox/index.html'),
          delayBadge: resolve(__dirname, 'src/renderer/delayBadge/index.html')
        }
      }
    }
  }
})

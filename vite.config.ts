import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },

  // TanStack Start 构建 SPA 时会临时启动 Vite Preview，
  // 显式使用 IPv4，避免容器内 localhost 解析为 ::1 导致 fetch ECONNREFUSED。
  preview: {
    host: '127.0.0.1',
  },

  server: {
    proxy: {
      '/api': {
        target: 'http://medical.jxutcm.top',
        changeOrigin: true,
      },
    },
  },

  plugins: [
    devtools(),
    tailwindcss(),

    tanstackStart({
      spa: {
        enabled: true,
      },
    }),

    viteReact(),
  ],
})


export default config

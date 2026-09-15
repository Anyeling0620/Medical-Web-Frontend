import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig(({ mode }) => {
  // 本地开发时前端与后端不同源：必须走 dev 代理，
  // 否则登录接口返回的 SameSite=Lax Cookie 不会被浏览器带回（表现为登录后立刻跳回登录页）。
  // 代理目标可用 VITE_DEV_PROXY_TARGET 覆盖（例如直连 IP），默认指向已部署域名。
  const env = loadEnv(mode, process.cwd(), '')
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'https://medical.jxutcm.top'

  return {
    resolve: { tsconfigPaths: true },

    // TanStack Start 构建 SPA 时会临时启动 Vite Preview，
    // 显式使用 IPv4，避免容器内 localhost 解析为 ::1 导致 fetch ECONNREFUSED。
    preview: {
      host: '127.0.0.1',
    },

    server: {
      proxy: {
        '/api': {
          // 目标必须是 https：写 http 会被服务端 301 跳回 https，
          // 而代理不跟随重定向，浏览器会拿到 301 并对 POST 重新发起跨站请求。
          target: devProxyTarget,
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
  }
})


export default config

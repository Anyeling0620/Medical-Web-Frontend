import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // 本地开发代理：前端请求同源 /api 前缀，由 Vite 转发到后端，
  // 规避浏览器跨域（CORS）预检因 X-Request-Id 等自定义请求头被拒绝。
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:9080',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    devtools(),
    tailwindcss(),
    // 走纯静态 SPA：构建产物是 dist/client 下的 _shell.html 加若干静态资源，直接交给 nginx 托管。
    // 注意 shell 文件名是 _shell.html 而不是 index.html —— 它来自 TanStack Start 的
    // spa.prerender.outputPath 默认值 /_shell（见 @tanstack/start-plugin-core 的 schema），
    // 因此 nginx 的回退必须写成：
    //     location / { root /var/www/medical-web; try_files $uri /_shell.html; }
    // 写成 /index.html 会 404。
    //
    // 之所以关掉服务端渲染：登录态校验与路由守卫本来就在浏览器端完成
    // （见 src/lib/auth-session.ts 与 src/routes/dashboard/route.tsx 的 beforeLoad），
    // 关掉 SSR 不改变任何行为，却让部署链路只剩「rsync 静态文件」一步，不再需要 Node 运行时；
    // 同时避免 SSR 阶段以相对路径请求 /api/v1 时打到错误的服务端地址。
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    viteReact(),
  ],
})

export default config

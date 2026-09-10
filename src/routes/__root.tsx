import { HeadContent, Outlet, Scripts, createRootRoute, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { useEffect } from 'react'
import { checkRouteGuard } from '../lib/auth-session'
import { QueryProvider } from '../lib/query-provider'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  // 守卫逻辑放在根组件：直接输入 URL 或刷新页面时，服务端读不到浏览器 Cookie，
  // 且水合后会复用服务端的路由结果而不再执行 beforeLoad，需要在这里补一次校验。
  component: RootGuard,
  shellComponent: RootDocument,
})

// 在水合完成后补一次登录态校验：结论与目标路径不一致时纠正路由（/、/login、/dashboard 三条规则）。
function RootGuard() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    void (async () => {
      // 校验结束后再读取当前路径，避免校验期间用户跳转导致误判。
      const target = await checkRouteGuard(router.state.location.pathname)
      if (cancelled || !target) return

      try {
        await router.navigate({ to: target, replace: true })
      } catch {
        // 跳转被新的导航中断时忽略：目标路由的 beforeLoad 会重新判定登录态。
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  return <Outlet />
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
      <QueryProvider>{children}</QueryProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}

import {
    QueryClient,
    QueryClientProvider,
} from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useState } from 'react'

interface QueryProviderProps {
    children: ReactNode
}

// 创建并复用同一个 QueryClient，避免组件重新渲染时丢失缓存。
export function QueryProvider({ children }: QueryProviderProps) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        retry: 1,
                        refetchOnWindowFocus: false,
                    },
                },
            }),
    )

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    )
}
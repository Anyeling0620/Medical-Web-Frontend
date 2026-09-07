import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'

// 后端接口与 MinIO 的连接配置，通过 Vite 环境变量注入。
export const apiConfig = {
  baseURL: import.meta.env.VITE_BASE_URL ?? 'http://localhost:8080',
  minioURL: import.meta.env.VITE_MINIO_URL ?? '',
  minioBucket: import.meta.env.VITE_MINIO_BUCKET ?? '',
}

type RequestData =
    | BodyInit
    | Record<string, unknown>
    | null
    | undefined

export interface AjaxOptions {
  url: string
  method?: string
  data?: RequestData
  fun?: (data: unknown) => void
}

// 拼接 baseURL 和接口地址，自动处理重复斜杠。
function joinURL(baseURL: string, url: string) {
  if (!baseURL) return url

  return `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
}

// 判断数据是否可以直接作为 fetch 请求体发送。
function isBodyInit(data: RequestData): data is BodyInit {
  return (
      typeof data === 'string' ||
      data instanceof Blob ||
      data instanceof FormData ||
      data instanceof URLSearchParams ||
      data instanceof ArrayBuffer
  )
}

// 解析接口响应，兼容 JSON、普通文本和空响应。
async function readResponse(response: Response) {
  if (response.status === 204) return undefined

  const text = await response.text()
  if (!text) return undefined

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

// 通用异步 AJAX 请求。
// 所有请求均使用异步方式。
export async function ajax<T = unknown>({
                                          url,
                                          method = 'GET',
                                          data,
                                          fun,
                                        }: AjaxOptions): Promise<T> {
  // 请求方法统一转换为大写。
  const requestMethod = method.toUpperCase()

  // 最终请求地址为 baseURL + url。
  const requestURL = new URL(
      joinURL(apiConfig.baseURL, url),
      window.location.origin,
  )

  const requestInit: RequestInit = {
    method: requestMethod,
    // 自动携带和接收后端设置的 HttpOnly Cookie。
    credentials: 'include',
    headers: {},
  }

  if (data !== undefined && data !== null) {
    // GET 和 HEAD 请求将对象数据转换为查询参数。
    if (requestMethod === 'GET' || requestMethod === 'HEAD') {
      if (typeof data === 'object' && !isBodyInit(data)) {
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            requestURL.searchParams.set(key, String(value))
          }
        })
      }
    } else if (isBodyInit(data)) {
      requestInit.body = data
    } else {
      // POST、PUT、PATCH 等请求默认发送 JSON。
      requestInit.body = JSON.stringify(data)
      requestInit.headers = {
        'Content-Type': 'application/json',
      }
    }
  }

  const response = await fetch(requestURL, requestInit)
  const responseData = await readResponse(response)

  // 非 2xx 状态统一抛出异常，TanStack Query 会接收 error 状态。
  if (!response.ok) {
    const message =
        typeof responseData === 'object' &&
        responseData !== null &&
        'message' in responseData
            ? String(responseData.message)
            : `请求失败：${response.status}`

    throw new Error(message)
  }

  // 仅在状态码为 200 时调用成功回调。
  if (response.status === 200) {
    fun?.(responseData)
  }

  return responseData as T
}

type QueryOptions<TData> = Omit<
    UseQueryOptions<TData, Error, TData>,
    'queryKey' | 'queryFn'
> &
    AjaxOptions & {
  queryKey: readonly unknown[]
}

// 封装查询请求，支持缓存、重新请求和错误状态。
export function useApiQuery<TData = unknown>({
                                               queryKey,
                                               ...request
                                             }: QueryOptions<TData>) {
  return useQuery<TData, Error, TData>({
    ...request,
    queryKey,
    queryFn: () => ajax<TData>(request),
  })
}

type MutationOptions<TData> = Omit<
    UseMutationOptions<TData, Error, void, unknown>,
    'mutationFn'
> &
    AjaxOptions

// 封装登录、创建、修改和删除等主动触发的请求。
export function useApiMutation<TData = unknown>(
    options: MutationOptions<TData>,
) {
  return useMutation<TData, Error, void>({
    ...options,
    mutationFn: () => ajax<TData>(options),
  })
}

// 生成 MinIO 桶内对象的访问地址。
export function getMinioObjectURL(objectName: string) {
  return joinURL(
      joinURL(apiConfig.minioURL, apiConfig.minioBucket),
      objectName,
  )
}

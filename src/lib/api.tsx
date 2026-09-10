import {
	type UseMutationOptions,
	type UseQueryOptions,
	useMutation,
	useQuery,
} from "@tanstack/react-query";
import { ApiError, type ApiErrorBody } from "./api-error";

// 后端接口与 MinIO 的连接配置，通过 Vite 环境变量注入。
export const apiConfig = {
	baseURL: import.meta.env.VITE_BASE_URL ?? "http://localhost:8080",
	minioURL: import.meta.env.VITE_MINIO_URL ?? "",
	minioBucket: import.meta.env.VITE_MINIO_BUCKET ?? "",
};

// 接口规范 1.1：所有后端接口的统一 Base URL 前缀。
export const API_BASE_PATH = "/api/v1";

// 请求体：允许浏览器原生的 BodyInit；其余普通对象（包括 interface 类型变量）由 ajax 自动 JSON 序列化。
type RequestData = BodyInit | object | null | undefined;

export interface AjaxOptions {
	url: string;
	method?: string;
	data?: RequestData;
	// 可选成功回调：响应 2xx 且非 204 时调用。
	fun?: (data: unknown) => void;
	// 附加请求头，键不区分大小写，可覆盖内部默认头。
	headers?: Record<string, string>;
	// 幂等键（规范 1.5）：映射为 Idempotency-Key 请求头。
	idempotencyKey?: string;
}

// 拼接 baseURL 和接口地址，自动处理重复斜杠。
function joinURL(baseURL: string, url: string) {
	if (!baseURL) return url;

	return `${baseURL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

// 计算最终请求地址：http(s) 绝对地址原样使用；
// 相对路径未以 /api/v1 开头时自动补全前缀（规范 1.1）。
function buildRequestURL(baseURL: string, url: string) {
	if (/^https?:\/\//i.test(url)) return url;

	const hasAPIPrefix =
		url === API_BASE_PATH || url.startsWith(`${API_BASE_PATH}/`);
	const path = hasAPIPrefix
		? url
		: `${API_BASE_PATH}/${url.replace(/^\//, "")}`;
	return joinURL(baseURL, path);
}

// 判断数据是否可以直接作为 fetch 请求体发送。
function isBodyInit(data: RequestData): data is BodyInit {
	return (
		typeof data === "string" ||
		data instanceof Blob ||
		data instanceof FormData ||
		data instanceof URLSearchParams ||
		data instanceof ArrayBuffer
	);
}

// 解析接口响应：204 与空响应返回 undefined；JSON 自动解析；其余文本原样返回。
async function readResponse(response: Response) {
	if (response.status === 204) return undefined;

	const text = await response.text();
	if (!text) return undefined;

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

// 校验响应体是否符合规范 1.3 的统一错误结构（含字符串 code 与 message）。
function isApiErrorBody(data: unknown): data is ApiErrorBody {
	if (typeof data !== "object" || data === null) return false;
	const record = data as Record<string, unknown>;
	return typeof record.code === "string" && typeof record.message === "string";
}

// 把非 2xx 响应转成 ApiError：符合标准错误体时原样包装；
// 否则 code 用 HTTP_<status>，message 留空由 ApiError 内部生成兜底文案。
function toApiError(status: number, data: unknown): ApiError {
	if (isApiErrorBody(data)) return new ApiError(status, data);
	return new ApiError(status, { code: `HTTP_${status}`, message: "" });
}

// 判断请求头集合中是否已存在同名头（不区分大小写），以便调用方覆盖默认值。
function hasHeader(headers: Record<string, string>, name: string) {
	const lowerName = name.toLowerCase();
	return Object.keys(headers).some((key) => key.toLowerCase() === lowerName);
}

// 生成 X-Request-Id：优先使用 crypto.randomUUID()；
// 降级为“req_ + 时间戳 + 随机串”，长度与字符集满足规范 1.1 要求。
function createRequestId(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	const stamp = Date.now().toString(36);
	const random = Math.random().toString(36).slice(2, 10);
	return `req_${stamp}${random}`;
}

// 通用异步 AJAX 请求：自动补全 /api/v1 前缀并携带 X-Request-Id。
export async function ajax<T = unknown>({
	url,
	method = "GET",
	data,
	fun,
	headers: extraHeaders,
	idempotencyKey,
}: AjaxOptions): Promise<T> {
	// 请求方法统一转换为大写。
	const requestMethod = method.toUpperCase();

	// 最终请求地址为 baseURL +（/api/v1 +）接口相对路径。
	const requestURL = new URL(
		buildRequestURL(apiConfig.baseURL, url),
		window.location.origin,
	);

	// 先合并调用方附加头，再补齐自动生成的默认头，保证附加头可覆盖默认值。
	const headers: Record<string, string> = {};
	if (extraHeaders) Object.assign(headers, extraHeaders);
	if (!hasHeader(headers, "X-Request-Id")) {
		headers["X-Request-Id"] = createRequestId();
	}
	if (idempotencyKey !== undefined && !hasHeader(headers, "Idempotency-Key")) {
		headers["Idempotency-Key"] = idempotencyKey;
	}
	// 项目约定：明确不做 If-Match 乐观并发（后端不下发 etag、PATCH 也不校验），
	// 因此这里不注入 If-Match 请求头；若后续规范再次出现该功能，按本约定忽略。

	const requestInit: RequestInit = {
		method: requestMethod,
		// 携带/接收后端设置（access、refresh）的 Cookie（规范 1.2/3.1）。
		credentials: "include",
		headers,
	};

	if (data !== undefined && data !== null) {
		if (requestMethod === "GET" || requestMethod === "HEAD") {
			// GET/HEAD：普通对象序列化为 URL 查询参数，跳过 undefined/null。
			if (typeof data === "object" && !isBodyInit(data)) {
				Object.entries(data).forEach(([key, value]) => {
					if (value !== undefined && value !== null) {
						requestURL.searchParams.set(key, String(value));
					}
				});
			}
		} else if (isBodyInit(data)) {
			// BodyInit（如 FormData）直接作为请求体，Content-Type 交给浏览器生成。
			requestInit.body = data;
		} else {
			// 普通对象统一 JSON 序列化并声明 JSON 请求头（规范 1.1）。
			requestInit.body = JSON.stringify(data);
			if (!hasHeader(headers, "Content-Type")) {
				headers["Content-Type"] = "application/json; charset=utf-8";
			}
		}
	}

	// fetch 拒绝（网络级异常）原样上抛，不做错误包装。
	const response = await fetch(requestURL, requestInit);
	const responseData = await readResponse(response);

	// 非 2xx 统一抛出 ApiError，TanStack Query 会进入 error 状态。
	if (!response.ok) {
		throw toApiError(response.status, responseData);
	}

	// 成功回调仅在响应 ok 且非 204 时调用。
	if (response.status !== 204) {
		fun?.(responseData);
	}

	return responseData as T;
}

type QueryOptions<TData> = Omit<
	UseQueryOptions<TData, ApiError, TData>,
	"queryKey" | "queryFn"
> &
	AjaxOptions & {
		queryKey: readonly unknown[];
	};

// 封装查询请求：错误类型统一为 ApiError，页面可直接读取 code/message。
export function useApiQuery<TData = unknown>({
	queryKey,
	...request
}: QueryOptions<TData>) {
	return useQuery<TData, ApiError, TData>({
		...request,
		queryKey,
		queryFn: () => ajax<TData>(request),
	});
}

type MutationOptions<TData> = Omit<
	UseMutationOptions<TData, ApiError, void, unknown>,
	"mutationFn"
> &
	AjaxOptions;

// 封装登录、创建、修改和删除等主动触发的请求，错误类型统一为 ApiError。
export function useApiMutation<TData = unknown>(
	options: MutationOptions<TData>,
) {
	return useMutation<TData, ApiError, void>({
		...options,
		mutationFn: () => ajax<TData>(options),
	});
}

// 生成 MinIO 桶内对象的访问地址。
export function getMinioObjectURL(objectName: string) {
	return joinURL(
		joinURL(apiConfig.minioURL, apiConfig.minioBucket),
		objectName,
	);
}

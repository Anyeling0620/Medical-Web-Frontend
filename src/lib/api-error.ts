// 接口规范 1.3：后端统一错误响应结构。
// 仅解析约定字段：code 为稳定的大写下划线错误码，message 面向用户，
// requestId 与响应头 X-Request-Id 一致，details 只含排障所需的非敏感字段。
export interface ApiErrorBody {
	code: string;
	message: string;
	requestId?: string;
	details?: Record<string, unknown> | null;
}

// 接口规范 9 错误码目录中标为“可重试”的错误码。
const RETRYABLE_CODES = new Set([
	"PAYMENT_PROVIDER_UNAVAILABLE",
	"DEPENDENCY_UNAVAILABLE",
]);

// 未携带标准错误体时，按 HTTP 状态给出面向用户的兜底文案。
function fallbackMessage(status: number): string {
	switch (status) {
		case 400:
			return "请求参数不正确";
		case 401:
			return "登录状态已失效，请重新登录";
		case 403:
			return "没有操作权限";
		case 404:
			return "请求的资源不存在";
		case 409:
			return "操作与当前状态冲突，请刷新后重试";
		case 422:
			return "提交的数据校验未通过";
		case 429:
			return "请求过于频繁，请稍后重试";
		default:
			return `请求失败（${status}）`;
	}
}

function isRetryable(status: number, code: string): boolean {
	return status >= 500 || RETRYABLE_CODES.has(code);
}

// 前端统一的接口错误类型：页面可直接读取 code/message/requestId/details。
export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly requestId?: string;
	readonly details?: Record<string, unknown> | null;
	readonly retryable: boolean;

	constructor(status: number, body: ApiErrorBody) {
		super(body.message || fallbackMessage(status));
		this.name = "ApiError";
		this.status = status;
		this.code = body.code;
		this.requestId = body.requestId;
		this.details = body.details;
		this.retryable = isRetryable(status, body.code);
	}
}

export function isApiError(error: unknown): error is ApiError {
	return error instanceof ApiError;
}

// 把任意错误转成面向用户的提示文案：标准错误优先取 message。
export function getApiErrorMessage(error: unknown): string {
	if (isApiError(error)) return error.message;
	if (error instanceof TypeError) return "网络连接异常，请检查网络后重试";
	if (error instanceof Error && error.message) return error.message;
	return "请求失败，请稍后重试";
}

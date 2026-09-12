// 接口规范 1.5：幂等键（Idempotency-Key）工具。
// 本模块统一生成 1-128 个可打印 ASCII 字符的幂等键，供各写接口在重复提交
// （双击、网络重试）时复用同一次创建结果，避免重复创建资源。
// 项目约定：明确不做 If-Match 乐观并发，写操作只依赖幂等键。

// 规范 1.5：Idempotency-Key 为 1-128 个可打印 ASCII 字符。
// 生成逻辑与字符集与 src/api/schedule.ts 的 createIdempotencyKey 保持一致：
// 优先使用 crypto.randomUUID()，不可用时降级为「时间戳 + 随机串」，最后截断到 128 字符。
export function createIdempotencyKey(prefix: string): string {
	const random =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
	return `${prefix}-${random}`.slice(0, 128);
}

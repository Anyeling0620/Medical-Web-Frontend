// 日期工具：排班接口的日期字段统一为 YYYY-MM-DD（规范 1.1），此处集中处理格式化与偏移，
// 避免各页面重复实现，也避免 new Date("YYYY-MM-DD") 被按 UTC 解析造成的跨日偏差。

// 把本地时间格式化为 YYYY-MM-DD。
export function formatDateYMD(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

// 业务当日（浏览器本地日历日）。
export function todayYMD(): string {
	return formatDateYMD(new Date());
}

// 基于本地日历日做天数偏移：days 可为负数。
export function shiftDateYMD(value: string, days: number): string {
	const parts = value.split("-").map(Number);
	if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
		return value;
	}
	const base = new Date(parts[0], parts[1] - 1, parts[2]);
	base.setDate(base.getDate() + days);
	return formatDateYMD(base);
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 返回 YYYY-MM-DD 对应的中文星期（解析失败返回空字符串）。
export function weekdayLabel(value: string): string {
	const parts = value.split("-").map(Number);
	if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
		return "";
	}
	return (
		WEEKDAY_LABELS[new Date(parts[0], parts[1] - 1, parts[2]).getDay()] ?? ""
	);
}

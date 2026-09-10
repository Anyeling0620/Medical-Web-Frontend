// Dashboard 指标聚合：纯函数，只做数据计算，不依赖 React、DOM 与网络请求。
// 数据口径来源：spec/04-api-contract.md 5.1 GET /api/v1/schedule/plans，
// 每项包含 used、remaining，includeSlots=true 时附带 slots。
// 本文件只使用 import type，运行时不引入任何模块，便于单独执行验证。
import type { WorkPlan } from "../api/schedule";

// 计划是否已划分时段：接口在计划没有时段时会省略 slots 字段。
export function hasSlots(plan: WorkPlan): boolean {
	return (plan.slots?.length ?? 0) > 0;
}

// 可约余量：患者挂号必须选择具体时段（规范 8.2），因此只有已划分时段的计划才真正可约。
// 未划分时段的计划按 0 计入，避免把不可约的计划容量当成可约号源。
export function bookableRemaining(plan: WorkPlan): number {
	const slots = plan.slots ?? [];
	if (slots.length === 0) return 0;
	return slots.reduce((sum, slot) => sum + slot.remaining, 0);
}

// 号源汇总：计划数、时段数、已用号源、计划容量、可约余量。
export interface SourceSummary {
	planCount: number;
	slotCount: number;
	used: number;
	maximum: number;
	bookable: number;
}

// 空汇总：无数据或接口失败时的兜底值，避免各处重复写字面量。
export function emptySourceSummary(): SourceSummary {
	return { planCount: 0, slotCount: 0, used: 0, maximum: 0, bookable: 0 };
}

// 汇总一组计划的号源与时段数量。
export function summarizePlans(plans: WorkPlan[]): SourceSummary {
	const summary = emptySourceSummary();
	for (const plan of plans) {
		summary.planCount += 1;
		summary.slotCount += plan.slots?.length ?? 0;
		summary.used += plan.used;
		summary.maximum += plan.maximum;
		summary.bookable += bookableRemaining(plan);
	}
	return summary;
}

// 容量利用率：范围 0~1；容量为 0 时返回 0，避免除零得到 NaN。
export function utilization(summary: {
	used: number;
	maximum: number;
}): number {
	if (summary.maximum <= 0) return 0;
	return summary.used / summary.maximum;
}

// 百分比文案：四舍五入到整数，用于 KPI 卡片展示。
export function formatPercent(rate: number): string {
	return `${Math.round(rate * 100)}%`;
}

// 按日汇总结果：在号源汇总之上附带日期。
export interface DailySourceSummary extends SourceSummary {
	date: string;
}

// 按日期汇总：dates 为连续的日期序列，窗口内没有计划的日期补 0，
// 保证图表 x 轴不因缺数据而断档；窗口之外的计划直接忽略。
export function summarizePlansByDate(
	plans: WorkPlan[],
	dates: string[],
): DailySourceSummary[] {
	const buckets = new Map<string, WorkPlan[]>();
	for (const date of dates) buckets.set(date, []);
	for (const plan of plans) buckets.get(plan.date)?.push(plan);
	return dates.map((date) => ({
		date,
		...summarizePlans(buckets.get(date) ?? []),
	}));
}

// 待关注计划的分类。
export type AttentionKind = "SOLD_OUT" | "NEARLY_FULL" | "NO_SLOTS";

// 容量利用率达到该阈值即视为「临近约满」。
export const NEARLY_FULL_THRESHOLD = 0.8;

export interface AttentionPlan {
	plan: WorkPlan;
	kind: AttentionKind;
	// 可约余量：约满判定与展示共用同一口径。
	bookable: number;
	// 计划容量利用率，用于展示与排序。
	utilization: number;
}

// 分类紧迫度：约满最紧急，其次临近约满，最后是没有时段可挂的计划。
const ATTENTION_RANK: Record<AttentionKind, number> = {
	SOLD_OUT: 0,
	NEARLY_FULL: 1,
	NO_SLOTS: 2,
};

// 判断单个计划是否需要关注：未划分时段、无可约余量、利用率达到阈值三类。
// 其余计划返回 null，由调用方过滤。
export function classifyAttentionPlan(
	plan: WorkPlan,
	threshold: number = NEARLY_FULL_THRESHOLD,
): AttentionPlan | null {
	const rate = utilization(plan);
	if (!hasSlots(plan)) {
		return { plan, kind: "NO_SLOTS", bookable: 0, utilization: rate };
	}
	const bookable = bookableRemaining(plan);
	if (bookable === 0) {
		return { plan, kind: "SOLD_OUT", bookable, utilization: rate };
	}
	if (rate >= threshold) {
		return { plan, kind: "NEARLY_FULL", bookable, utilization: rate };
	}
	return null;
}

// 筛选并排序待关注计划：先按分类紧迫度，再按日期升序，最后按可约余量升序，
// 使余量最少、日期最近的计划排在前面。
export function pickAttentionPlans(
	plans: WorkPlan[],
	threshold: number = NEARLY_FULL_THRESHOLD,
): AttentionPlan[] {
	const picked: AttentionPlan[] = [];
	for (const plan of plans) {
		const item = classifyAttentionPlan(plan, threshold);
		if (item) picked.push(item);
	}
	return picked.sort((left, right) => {
		const rank = ATTENTION_RANK[left.kind] - ATTENTION_RANK[right.kind];
		if (rank !== 0) return rank;
		if (left.plan.date !== right.plan.date) {
			return left.plan.date < right.plan.date ? -1 : 1;
		}
		if (left.bookable !== right.bookable) {
			return left.bookable - right.bookable;
		}
		return left.plan.id - right.plan.id;
	});
}

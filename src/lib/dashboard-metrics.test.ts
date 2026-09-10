// Dashboard 指标聚合的单元测试，使用 Node 内置测试运行器（node --test），不引入额外依赖。
// 运行命令：node --test src/lib/dashboard-metrics.test.ts
// 之所以能直接运行 .ts：dashboard-metrics.ts 只使用 import type，运行时不解析任何模块，
// 可被 Node 的类型擦除直接加载；相对导入必须带 .ts 扩展名（tsconfig 已开 allowImportingTsExtensions）。
//
// 口径（与生产实现一致）：
// - 计划层字段：planCount / used / maximum 直接累加 plan.used 与 plan.maximum；
//   slotCount 累加每个计划的 slots 数量（未划分时段的计划贡献 0）。
// - 可约余量 bookable 只统计已划分时段的计划（Σ slot.remaining），未划分时段的计划记 0。
// - 利用率 utilization 用计划层 {used, maximum}，容量为 0 时返回 0。
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ScheduleSlot, WorkPlan } from "../api/schedule";
import {
	type AttentionPlan,
	bookableRemaining,
	classifyAttentionPlan,
	emptySourceSummary,
	formatPercent,
	hasSlots,
	NEARLY_FULL_THRESHOLD,
	pickAttentionPlans,
	summarizePlans,
	summarizePlansByDate,
	utilization,
} from "./dashboard-metrics.ts";

// 构造计划夹具：只传需要覆盖的字段，其余给稳定默认值。
function makePlan(overrides: Partial<WorkPlan> & { id: number }): WorkPlan {
	return {
		doctorId: 1,
		subdepartmentId: 1,
		date: "2026-09-10",
		maximum: 40,
		used: 10,
		remaining: 30,
		...overrides,
	};
}

// 构造时段夹具：remaining 决定可约余量。
function makeSlot(
	overrides: Partial<ScheduleSlot> & { id: number },
): ScheduleSlot {
	return {
		workPlanId: 1,
		slot: 1,
		maximum: 10,
		used: 0,
		remaining: 10,
		...overrides,
	};
}

// 判断数值是否可用：NaN / Infinity 会让 KPI 卡片与图表显示异常，必须能被断言捕获。
function isUsableNumber(value: number): boolean {
	return Number.isFinite(value);
}

// 取出待关注计划的 id 序列，便于断言排序结果。
function idsOf(items: AttentionPlan[]): number[] {
	return items.map((item) => item.plan.id);
}

describe("hasSlots / bookableRemaining", () => {
	test("slots 省略时视为没有时段，可约余量记 0", () => {
		const plan = makePlan({ id: 1, remaining: 30 });
		assert.strictEqual(hasSlots(plan), false);
		assert.strictEqual(bookableRemaining(plan), 0);
	});

	test("slots 为空数组时同样视为没有时段，可约余量记 0", () => {
		const plan = makePlan({ id: 2, slots: [] });
		assert.strictEqual(hasSlots(plan), false);
		assert.strictEqual(bookableRemaining(plan), 0);
	});

	test("有时段时可约余量为各时段 remaining 之和", () => {
		const plan = makePlan({
			id: 3,
			slots: [
				makeSlot({ id: 1, remaining: 4 }),
				makeSlot({ id: 2, remaining: 6 }),
				makeSlot({ id: 3, remaining: 0 }),
			],
		});
		assert.strictEqual(hasSlots(plan), true);
		assert.strictEqual(bookableRemaining(plan), 10);
	});

	test("全部时段约满时可约余量为 0", () => {
		const plan = makePlan({
			id: 4,
			slots: [
				makeSlot({ id: 1, remaining: 0 }),
				makeSlot({ id: 2, remaining: 0 }),
			],
		});
		assert.strictEqual(hasSlots(plan), true);
		assert.strictEqual(bookableRemaining(plan), 0);
	});
});

describe("summarizePlans / emptySourceSummary", () => {
	test("空数组返回全 0 汇总", () => {
		assert.deepStrictEqual(summarizePlans([]), {
			planCount: 0,
			slotCount: 0,
			used: 0,
			maximum: 0,
			bookable: 0,
		});
	});

	test("emptySourceSummary 与空数组汇总一致", () => {
		assert.deepStrictEqual(emptySourceSummary(), summarizePlans([]));
	});

	test("累加计划数、时段数、已用号源、计划容量与可约余量", () => {
		const plans = [
			makePlan({
				id: 1,
				maximum: 40,
				used: 10,
				slots: [
					makeSlot({ id: 1, remaining: 25 }),
					makeSlot({ id: 2, remaining: 5 }),
				],
			}),
			// 未划分时段的计划：时段数 0、可约余量 0，但计划数与计划层字段照常计入。
			makePlan({ id: 2, maximum: 20, used: 20 }),
			makePlan({
				id: 3,
				maximum: 10,
				used: 0,
				slots: [makeSlot({ id: 3, remaining: 10 })],
			}),
		];
		assert.deepStrictEqual(summarizePlans(plans), {
			planCount: 3,
			slotCount: 3,
			used: 30,
			maximum: 70,
			bookable: 40,
		});
	});

	test("未划分时段的计划计入 planCount/slotCount/used/maximum，但 bookable 记 0", () => {
		const plan = makePlan({ id: 1, maximum: 30, used: 12, remaining: 18 });
		assert.strictEqual(hasSlots(plan), false);
		assert.deepStrictEqual(summarizePlans([plan]), {
			planCount: 1,
			slotCount: 0,
			used: 12,
			maximum: 30,
			bookable: 0,
		});
	});

	test("单个计划的时段数按 slots 长度累加", () => {
		const plan = makePlan({
			id: 1,
			slots: [makeSlot({ id: 1 }), makeSlot({ id: 2 }), makeSlot({ id: 3 })],
		});
		assert.strictEqual(summarizePlans([plan]).slotCount, 3);
	});
});

describe("utilization", () => {
	test("容量为 0 时返回 0 而不是 NaN", () => {
		const rate = utilization({ used: 0, maximum: 0 });
		assert.strictEqual(rate, 0);
		assert.strictEqual(Number.isNaN(rate), false);
	});

	test("容量为负数时返回 0", () => {
		assert.strictEqual(utilization({ used: 5, maximum: -10 }), 0);
	});

	test("正常比例按 used / maximum 计算", () => {
		assert.strictEqual(utilization({ used: 10, maximum: 40 }), 0.25);
		assert.strictEqual(utilization({ used: 40, maximum: 40 }), 1);
		assert.strictEqual(utilization({ used: 8, maximum: 10 }), 0.8);
		const third = utilization({ used: 1, maximum: 3 });
		assert.strictEqual(isUsableNumber(third), true);
		assert.strictEqual(Math.abs(third - 1 / 3) < Number.EPSILON * 2, true);
	});

	test("已用超过容量时返回大于 1 的比例（不做截断）", () => {
		assert.strictEqual(utilization({ used: 12, maximum: 10 }), 1.2);
	});
});

describe("formatPercent", () => {
	test("四舍五入到整数百分比（含半值进位）", () => {
		assert.strictEqual(formatPercent(0), "0%");
		assert.strictEqual(formatPercent(0.125), "13%");
		assert.strictEqual(formatPercent(0.804), "80%");
		assert.strictEqual(formatPercent(1), "100%");
		assert.strictEqual(formatPercent(1.2), "120%");
	});

	test("浮点误差不产生小数位", () => {
		assert.strictEqual(formatPercent(0.1 + 0.2), "30%");
	});
});

describe("summarizePlansByDate", () => {
	const dates = ["2026-09-08", "2026-09-09", "2026-09-10"];

	test("窗口内没有计划的日期补 0，窗口外的计划被忽略", () => {
		const plans = [
			makePlan({
				id: 1,
				date: "2026-09-09",
				maximum: 30,
				used: 12,
				slots: [makeSlot({ id: 1, remaining: 18 })],
			}),
			makePlan({
				id: 2,
				date: "2026-09-09",
				maximum: 20,
				used: 5,
				slots: [makeSlot({ id: 2, remaining: 15 })],
			}),
			makePlan({ id: 3, date: "2026-09-11", maximum: 99, used: 99 }),
			makePlan({ id: 4, date: "2026-09-07", maximum: 99, used: 99 }),
		];
		const result = summarizePlansByDate(plans, dates);
		assert.deepStrictEqual(result, [
			{
				date: "2026-09-08",
				planCount: 0,
				slotCount: 0,
				used: 0,
				maximum: 0,
				bookable: 0,
			},
			{
				date: "2026-09-09",
				planCount: 2,
				slotCount: 2,
				used: 17,
				maximum: 50,
				bookable: 33,
			},
			{
				date: "2026-09-10",
				planCount: 0,
				slotCount: 0,
				used: 0,
				maximum: 0,
				bookable: 0,
			},
		]);
	});

	test("结果顺序与传入的 dates 一致", () => {
		const reversed = ["2026-09-10", "2026-09-09", "2026-09-08"];
		const plans = [makePlan({ id: 1, date: "2026-09-08" })];
		assert.deepStrictEqual(
			summarizePlansByDate(plans, reversed).map((item) => item.date),
			reversed,
		);
		assert.deepStrictEqual(
			summarizePlansByDate(plans, reversed).map((item) => item.planCount),
			[0, 0, 1],
		);
	});

	test("空计划列表返回全 0 且长度与 dates 一致", () => {
		const result = summarizePlansByDate([], dates);
		assert.strictEqual(result.length, 3);
		assert.deepStrictEqual(
			result.map((item) => item.maximum),
			[0, 0, 0],
		);
	});

	test("空 dates 返回空数组", () => {
		assert.deepStrictEqual(summarizePlansByDate([makePlan({ id: 1 })], []), []);
	});
});

describe("classifyAttentionPlan", () => {
	test("默认阈值常量为 0.8", () => {
		assert.strictEqual(NEARLY_FULL_THRESHOLD, 0.8);
	});

	test("时段全满归类为 SOLD_OUT", () => {
		const plan = makePlan({
			id: 1,
			maximum: 20,
			used: 20,
			slots: [
				makeSlot({ id: 1, remaining: 0 }),
				makeSlot({ id: 2, remaining: 0 }),
			],
		});
		assert.deepStrictEqual(classifyAttentionPlan(plan), {
			plan,
			kind: "SOLD_OUT",
			bookable: 0,
			utilization: 1,
		});
	});

	test("利用率达到 0.8 且仍有可约余量归类为 NEARLY_FULL", () => {
		const plan = makePlan({
			id: 2,
			maximum: 10,
			used: 8,
			slots: [makeSlot({ id: 1, maximum: 10, used: 8, remaining: 2 })],
		});
		assert.deepStrictEqual(classifyAttentionPlan(plan), {
			plan,
			kind: "NEARLY_FULL",
			bookable: 2,
			utilization: 0.8,
		});
	});

	test("恰好等于阈值（8/10）判定为 NEARLY_FULL", () => {
		const plan = makePlan({
			id: 3,
			maximum: 10,
			used: 8,
			slots: [makeSlot({ id: 1, remaining: 2 })],
		});
		assert.strictEqual(classifyAttentionPlan(plan)?.kind, "NEARLY_FULL");
	});

	test("无时段的计划归类为 NO_SLOTS", () => {
		const plan = makePlan({ id: 4, maximum: 30, used: 0 });
		assert.deepStrictEqual(classifyAttentionPlan(plan), {
			plan,
			kind: "NO_SLOTS",
			bookable: 0,
			utilization: 0,
		});
	});

	test("同时满足无时段与利用率达标时按 NO_SLOTS 归类", () => {
		const plan = makePlan({ id: 5, maximum: 10, used: 10 });
		assert.deepStrictEqual(classifyAttentionPlan(plan), {
			plan,
			kind: "NO_SLOTS",
			bookable: 0,
			utilization: 1,
		});
	});

	test("利用率低于阈值且有余量时返回 null", () => {
		const plan = makePlan({
			id: 6,
			maximum: 40,
			used: 10,
			slots: [makeSlot({ id: 1, maximum: 40, used: 10, remaining: 30 })],
		});
		assert.strictEqual(classifyAttentionPlan(plan), null);
	});

	test("返回项包含可约余量与利用率两个展示字段", () => {
		const plan = makePlan({
			id: 7,
			maximum: 10,
			used: 9,
			slots: [makeSlot({ id: 1, remaining: 1 })],
		});
		const item = classifyAttentionPlan(plan);
		assert.notStrictEqual(item, null);
		assert.deepStrictEqual(Object.keys(item ?? {}).sort(), [
			"bookable",
			"kind",
			"plan",
			"utilization",
		]);
	});

	test("阈值可覆盖：0.5 时利用率 0.6 的计划入选", () => {
		const plan = makePlan({
			id: 8,
			maximum: 10,
			used: 6,
			slots: [makeSlot({ id: 1, maximum: 10, used: 6, remaining: 4 })],
		});
		assert.strictEqual(classifyAttentionPlan(plan), null);
		assert.strictEqual(classifyAttentionPlan(plan, 0.5)?.kind, "NEARLY_FULL");
	});

	test("阈值高于 1 时不再判定 NEARLY_FULL，但约满与无时段仍然入选", () => {
		const nearly = makePlan({
			id: 9,
			maximum: 10,
			used: 9,
			slots: [makeSlot({ id: 1, maximum: 10, used: 9, remaining: 1 })],
		});
		const soldOut = makePlan({
			id: 10,
			maximum: 10,
			used: 10,
			slots: [makeSlot({ id: 1, remaining: 0 })],
		});
		const noSlots = makePlan({ id: 11, maximum: 10, used: 0 });
		assert.strictEqual(classifyAttentionPlan(nearly, 1.1), null);
		assert.strictEqual(classifyAttentionPlan(soldOut, 1.1)?.kind, "SOLD_OUT");
		assert.strictEqual(classifyAttentionPlan(noSlots, 1.1)?.kind, "NO_SLOTS");
	});
});

describe("pickAttentionPlans", () => {
	// 覆盖全部三个分类，并在 NEARLY_FULL 内制造「同日期不同余量」「同日期同余量不同 id」的并列。
	const noSlots = makePlan({
		id: 11,
		date: "2026-09-12",
		maximum: 10,
		used: 0,
	});
	const soldOut = makePlan({
		id: 12,
		date: "2026-09-11",
		maximum: 10,
		used: 10,
		slots: [makeSlot({ id: 1, remaining: 0 })],
	});
	const nearlyLater = makePlan({
		id: 13,
		date: "2026-09-11",
		maximum: 10,
		used: 8,
		slots: [makeSlot({ id: 1, maximum: 10, used: 8, remaining: 2 })],
	});
	const nearlyEarlier = makePlan({
		id: 14,
		date: "2026-09-10",
		maximum: 10,
		used: 9,
		slots: [makeSlot({ id: 1, maximum: 10, used: 9, remaining: 1 })],
	});
	const nearlyTieHighId = makePlan({
		id: 15,
		date: "2026-09-10",
		maximum: 100,
		used: 85,
		slots: [makeSlot({ id: 1, maximum: 100, used: 85, remaining: 15 })],
	});
	const nearlyTieLowId = makePlan({
		id: 10,
		date: "2026-09-10",
		maximum: 100,
		used: 85,
		slots: [makeSlot({ id: 1, maximum: 100, used: 85, remaining: 15 })],
	});
	const healthy = makePlan({
		id: 16,
		date: "2026-09-10",
		maximum: 40,
		used: 4,
		slots: [makeSlot({ id: 1, maximum: 40, used: 4, remaining: 36 })],
	});
	const plans = [
		noSlots,
		nearlyLater,
		healthy,
		soldOut,
		nearlyTieHighId,
		nearlyEarlier,
		nearlyTieLowId,
	];

	test("先按分类紧迫度，再按日期升序、可约余量升序、id 升序", () => {
		// 期望顺序：SOLD_OUT(12) → NEARLY_FULL 按日期 09-10 内余量 1(14)、余量 15 同量按 id(10,15)、
		// 再 09-11 余量 2(13) → NO_SLOTS(11)。
		assert.deepStrictEqual(
			idsOf(pickAttentionPlans(plans)),
			[12, 14, 10, 15, 13, 11],
		);
	});

	test("不满足条件的计划不入选", () => {
		const ids = idsOf(pickAttentionPlans(plans));
		assert.strictEqual(ids.includes(healthy.id), false);
		assert.deepStrictEqual(pickAttentionPlans([healthy]), []);
	});

	test("空数组返回空结果", () => {
		assert.deepStrictEqual(pickAttentionPlans([]), []);
	});

	test("不改动传入数组的顺序", () => {
		const before = plans.map((plan) => plan.id);
		pickAttentionPlans(plans);
		assert.deepStrictEqual(
			plans.map((plan) => plan.id),
			before,
		);
	});

	test("返回项与 classifyAttentionPlan 的结果一致", () => {
		const picked = pickAttentionPlans(plans);
		for (const item of picked) {
			assert.deepStrictEqual(item, classifyAttentionPlan(item.plan));
		}
		assert.strictEqual(picked.length, 6);
	});
});

describe("异常数据边界", () => {
	test("负数号源不产生 NaN", () => {
		const plan = makePlan({
			id: 1,
			maximum: 10,
			used: -5,
			slots: [makeSlot({ id: 1, remaining: -3 })],
		});
		const summary = summarizePlans([plan]);
		assert.strictEqual(isUsableNumber(summary.bookable), true);
		assert.strictEqual(summary.bookable, -3);
		const rate = utilization(plan);
		assert.strictEqual(isUsableNumber(rate), true);
		assert.strictEqual(rate, -0.5);
	});

	test("容量为 0 的计划不产生 NaN 且被判为 SOLD_OUT（时段存在但无余量）", () => {
		const plan = makePlan({
			id: 2,
			maximum: 0,
			used: 0,
			slots: [makeSlot({ id: 1, remaining: 0 })],
		});
		const summary = summarizePlans([plan]);
		assert.strictEqual(isUsableNumber(utilization(summary)), true);
		assert.strictEqual(formatPercent(utilization(summary)), "0%");
		assert.strictEqual(classifyAttentionPlan(plan)?.kind, "SOLD_OUT");
	});

	test("未划分时段且容量为 0 时不产生 NaN，并判为 NO_SLOTS", () => {
		const plan = makePlan({ id: 3, maximum: 0, used: 0 });
		assert.strictEqual(isUsableNumber(utilization(plan)), true);
		assert.strictEqual(classifyAttentionPlan(plan)?.kind, "NO_SLOTS");
	});

	test("按日汇总的每个数字字段都是可用数值", () => {
		const plans = [
			makePlan({ id: 1, date: "2026-09-09", maximum: 0, used: 0 }),
			makePlan({
				id: 2,
				date: "2026-09-09",
				maximum: 10,
				used: -2,
				slots: [makeSlot({ id: 1, remaining: -1 })],
			}),
		];
		for (const item of summarizePlansByDate(plans, ["2026-09-09"])) {
			assert.strictEqual(isUsableNumber(item.planCount), true);
			assert.strictEqual(isUsableNumber(item.slotCount), true);
			assert.strictEqual(isUsableNumber(item.used), true);
			assert.strictEqual(isUsableNumber(item.maximum), true);
			assert.strictEqual(isUsableNumber(item.bookable), true);
		}
	});
});

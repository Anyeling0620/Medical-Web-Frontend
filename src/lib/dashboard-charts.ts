// Dashboard 图表配置：把聚合结果映射为 ECharts option。
// 本文件只负责「数据 -> 配置」的纯映射，不接触 DOM；实例生命周期由
// src/components/ui/echart.tsx 统一管理，避免页面里堆叠图表初始化代码。
import type { EChartsCoreOption } from "echarts/core";
import type { DailySourceSummary } from "./dashboard-metrics";
import { weekdayLabel } from "./date";

// 统一配色与文字色：与页面 Blue / Purple 主色保持一致，避免各图表风格分裂。
const COLOR_USED = "#6366f1";
const COLOR_BOOKABLE = "#a5b4fc";
const COLOR_TEXT = "#475569";
const COLOR_GRID = "#e2e8f0";

// 未来 N 天号源趋势：堆叠柱状图，展示每天「已用号源 + 可约余量」。
// 说明：可约余量只统计已划分时段的计划（见 dashboard-metrics 的 bookableRemaining），
// 因此柱高不必然等于计划容量，tooltip 中给出完整口径。
export function buildSourceTrendOption(
	daily: DailySourceSummary[],
): EChartsCoreOption {
	return {
		color: [COLOR_USED, COLOR_BOOKABLE],
		tooltip: {
			trigger: "axis",
			axisPointer: { type: "shadow" },
		},
		legend: {
			data: ["已用号源", "可约余量"],
			bottom: 0,
			icon: "roundRect",
			itemWidth: 10,
			itemHeight: 10,
			textStyle: { color: COLOR_TEXT, fontSize: 12 },
		},
		grid: { left: 4, right: 12, top: 16, bottom: 44, containLabel: true },
		xAxis: {
			type: "category",
			// x 轴展示「MM-DD + 星期」，日期取自接口返回的 YYYY-MM-DD。
			data: daily.map(
				(item) => `${item.date.slice(5)}\n${weekdayLabel(item.date)}`,
			),
			axisTick: { show: false },
			axisLine: { lineStyle: { color: COLOR_GRID } },
			axisLabel: { color: COLOR_TEXT, fontSize: 11, lineHeight: 15 },
		},
		yAxis: {
			type: "value",
			// 号源是整数：避免出现 0.5 这类无意义刻度。
			minInterval: 1,
			axisLine: { show: false },
			axisLabel: { color: COLOR_TEXT, fontSize: 11 },
			splitLine: { lineStyle: { color: COLOR_GRID, type: "dashed" } },
		},
		series: [
			{
				name: "已用号源",
				type: "bar",
				stack: "source",
				barMaxWidth: 30,
				data: daily.map((item) => item.used),
			},
			{
				name: "可约余量",
				type: "bar",
				stack: "source",
				barMaxWidth: 30,
				itemStyle: { borderRadius: [4, 4, 0, 0] },
				data: daily.map((item) => item.bookable),
			},
		],
	};
}

// 医生状态分布的单个扇区：name 为状态中文名，value 为人数。
export interface DoctorStatusDatum {
	name: string;
	value: number;
}

// 医生状态分布：环形图。只展示规模对比，不展示隐藏医生。
export function buildDoctorStatusOption(
	data: DoctorStatusDatum[],
): EChartsCoreOption {
	return {
		color: ["#10b981", "#f59e0b", "#94a3b8"],
		tooltip: { trigger: "item", formatter: "{b}：{c} 人（{d}%）" },
		legend: {
			bottom: 0,
			icon: "circle",
			itemWidth: 10,
			itemHeight: 10,
			textStyle: { color: COLOR_TEXT, fontSize: 12 },
		},
		series: [
			{
				type: "pie",
				radius: ["50%", "70%"],
				center: ["50%", "44%"],
				itemStyle: { borderColor: "#ffffff", borderWidth: 2 },
				// 环形图扇区较窄时外置标签容易重叠，统一改为悬浮查看。
				label: { show: false },
				labelLine: { show: false },
				emphasis: { scale: false },
				data,
			},
		],
	};
}

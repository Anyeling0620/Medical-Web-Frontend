// ECharts 容器组件：统一管理实例生命周期（初始化、更新、销毁）与自适应尺寸。
// 设计要点：
// 1) echarts 在 useEffect 内动态引入（见 ./echart-impl.ts）。SSR 阶段不加载图表库、
//    不触碰 DOM，避免服务端渲染报错，同时把图表库从首屏包中拆出。
// 2) 组件始终渲染容器 div，服务端与客户端首屏输出一致，不会产生 hydration 不一致。
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { useEffect, useRef } from "react";

// 图表库模块句柄：整个应用只加载一次，并发调用复用同一个 Promise。
let echartsPromise: Promise<typeof import("./echart-impl")> | null = null;

function loadECharts(): Promise<typeof import("./echart-impl")> {
	if (!echartsPromise) {
		echartsPromise = import("./echart-impl");
	}
	return echartsPromise;
}

type EChartProps = {
	option: EChartsCoreOption;
	// 高度等尺寸由调用方通过 className 指定，组件本身不预设尺寸。
	className?: string;
	// 无障碍名称：图表对读屏用户不可见，用 aria-label 描述其含义。
	ariaLabel: string;
};

export function EChart({ option, className = "", ariaLabel }: EChartProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const chartRef = useRef<EChartsType | null>(null);
	// 供初始化回调读取最新 option：实例创建是异步的，创建完成时可能已有新数据。
	const optionRef = useRef(option);
	optionRef.current = option;

	// 初始化与销毁：仅在客户端执行。StrictMode 在开发环境会挂载两次，
	// 因此必须用 cancelled 标记丢弃「已卸载之后才完成」的异步初始化结果。
	useEffect(() => {
		let cancelled = false;
		const container = containerRef.current;
		if (!container) return;

		void loadECharts()
			.then(({ init }) => {
				if (cancelled || chartRef.current) return;
				const chart = init(container);
				chartRef.current = chart;
				chart.setOption(optionRef.current, true);
			})
			.catch((error) => {
				// 图表库分片加载失败（网络中断、部署后资源被清理）时不让异常冒泡成
				// unhandled rejection：容器保持空白，页面其余部分仍可用。
				echartsPromise = null;
				console.warn("[EChart] 图表库加载失败，本次不渲染图表", error);
			});

		return () => {
			cancelled = true;
			chartRef.current?.dispose();
			chartRef.current = null;
		};
	}, []);

	// 尺寸自适应：侧边栏折叠或窗口缩放导致容器尺寸变化时重绘。
	useEffect(() => {
		const container = containerRef.current;
		if (!container || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => chartRef.current?.resize());
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	// option 变化时刷新图表；实例尚未创建时为空操作，由初始化流程读取最新 option。
	useEffect(() => {
		chartRef.current?.setOption(option, true);
	}, [option]);

	return (
		<div
			ref={containerRef}
			className={className}
			role="img"
			aria-label={ariaLabel}
		/>
	);
}

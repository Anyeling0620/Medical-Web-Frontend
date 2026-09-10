import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowRight,
	Building2,
	CalendarDays,
	Info,
	Percent,
	RefreshCw,
	Stethoscope,
	Ticket,
	TrendingUp,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
// 基础资料域（规范 4.2）：科室/子科室字典与医生目录，用于资源规模统计与名称映射。
import {
	getAllDoctorsIncludingInactive,
	getDoctorOptions,
} from "@/api/doctors";
// 排班域（规范 5.1）：出诊计划查询，统计口径的唯一数据来源。
import { getAllSchedulePlans } from "@/api/schedule";
import { Button } from "@/components/ui";
import { EChart } from "@/components/ui/echart";
import { getApiErrorMessage } from "@/lib/api-error";
import { checkAuthSession } from "@/lib/auth-session";
import {
	buildDoctorStatusOption,
	buildSourceTrendOption,
} from "@/lib/dashboard-charts";
import {
	type AttentionKind,
	formatPercent,
	pickAttentionPlans,
	summarizePlans,
	summarizePlansByDate,
	utilization,
} from "@/lib/dashboard-metrics";
import { shiftDateYMD, todayYMD, weekdayLabel } from "@/lib/date";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardPage,
});

// 统计窗口：今天起 7 天（含当天）。窗口过大会让 pageSize 上限（规范 1.4 为 100）
// 触发的全量分页请求变多，7 天与常用排班周期一致，也足够覆盖「近一周」的运营视角。
const RANGE_DAYS = 7;

// 待关注计划在页面上最多展示的条数，超出部分只给出数量提示。
const ATTENTION_LIMIT = 8;

// 规范 1.4：列表接口 pageSize 上限为 100，取该值可在一次请求内覆盖常见的数据量。
const PAGE_SIZE = 100;

// 待关注计划的分类中文名：与 dashboard-metrics 的 AttentionKind 一一对应。
const ATTENTION_LABELS: Record<AttentionKind, string> = {
	SOLD_OUT: "已约满",
	NEARLY_FULL: "临近约满",
	NO_SLOTS: "未划分时段",
};

// 待关注标签的配色：约满用红色，其余用琥珀色，与列表里的状态色保持一致。
const ATTENTION_STYLES: Record<AttentionKind, string> = {
	SOLD_OUT: "bg-red-50 text-red-600",
	NEARLY_FULL: "bg-amber-50 text-amber-700",
	NO_SLOTS: "bg-slate-100 text-slate-600",
};

// 资源概览：由基础资料域接口聚合而来（当前后端没有统计接口，聚合在前端完成）。
interface ResourceOverview {
	departmentCount: number;
	subdepartmentCount: number;
	doctorCounts: { name: string; value: number }[];
	doctorNames: Map<number, string>;
	subdepartmentNames: Map<number, string>;
}

// 拉取资源概览：
// - GET /catalog/doctors/options 返回全部科室与子科室（后端为整表查询），同时提供名称映射；
// - 医生目录按状态分别全量拉取后合并，既能得到各状态人数，也能得到医生姓名映射。
//   说明：接口 status 缺省为 ACTIVE，必须显式按状态查询才能统计出离职/退休医生。
async function fetchResourceOverview(): Promise<ResourceOverview> {
	const [options, doctors] = await Promise.all([
		getDoctorOptions(),
		getAllDoctorsIncludingInactive({ pageSize: PAGE_SIZE }),
	]);

	// 隐藏医生（HIDDEN）不在可见集合中，因此这里只统计在岗/离职/退休三类。
	const counts: Record<string, number> = {
		ACTIVE: 0,
		RESIGNED: 0,
		RETIRED: 0,
	};
	for (const doctor of doctors) {
		// 用 Object.hasOwn 而不是 in：in 会命中原型链上的属性名。
		if (Object.hasOwn(counts, doctor.status)) counts[doctor.status] += 1;
	}

	return {
		departmentCount: options.departments.length,
		subdepartmentCount: options.subdepartments.length,
		doctorCounts: [
			{ name: "在岗", value: counts.ACTIVE },
			{ name: "离职", value: counts.RESIGNED },
			{ name: "退休", value: counts.RETIRED },
		],
		doctorNames: new Map(doctors.map((doctor) => [doctor.id, doctor.name])),
		subdepartmentNames: new Map(
			options.subdepartments.map((item) => [item.id, item.name]),
		),
	};
}

/**
 * 管理端首页（运营总览）。
 *
 * 定位：回答「今天有没有排班、号源够不够、还缺什么」三个问题，而不是再做一个列表页。
 * 数据口径：全部来自已实现的后端接口（排班域 + 基础资料域），不展示任何未接入的数据，
 * 因此不包含挂号量、收入、患者数等尚未实现的能力（见 spec/01-product-scope.md 的范围约定）。
 */
function DashboardPage() {
	const queryClient = useQueryClient();

	// 业务日期：口径与排班接口一致（YYYY-MM-DD），不使用 new Date 直接参与展示。
	const [today] = useState(todayYMD);
	const rangeEnd = shiftDateYMD(today, RANGE_DAYS - 1);
	// 连续日期序列：用于按日汇总与图表 x 轴，缺失日期补 0，保证不断档。
	const dates = useMemo(
		() =>
			Array.from({ length: RANGE_DAYS }, (_, index) =>
				shiftDateYMD(today, index),
			),
		[today],
	);

	// 权限来源：登录/刷新响应中的完整权限数组（规范 3.1/3.2），结论由 lib/auth-session 缓存。
	// 说明：GET /mis/auth/me 目前尚未在后端注册，因此不能依赖该接口获取实时权限。
	// queryKey 不放在 dashboard 前缀下，避免「刷新」连带触发 refresh token 轮换。
	const sessionQuery = useQuery({
		queryKey: ["auth-session"],
		queryFn: checkAuthSession,
		staleTime: 30_000,
	});
	const permissions = sessionQuery.data?.permissions ?? [];
	// 权限未知（会话结论尚未返回）时先放行请求，由接口返回真实结果，避免首屏把有权限的
	// 用户误判为无权限；结论已知后再按权限编码精确控制，避免必然 403 的无效请求。
	const permissionsKnown = sessionQuery.isSuccess && sessionQuery.data !== null;
	const canRead = (code: string) =>
		!permissionsKnown ||
		permissions.includes("ROOT") ||
		permissions.includes(code);

	const canSchedule = canRead("SCHEDULE:SELECT");
	const canCatalog = canRead("CATALOG:SELECT");

	// GET /api/v1/schedule/plans（规范 5.1）：窗口内全部计划，含时段明细。
	const plansQuery = useQuery({
		queryKey: ["dashboard", "schedule-plans", today, rangeEnd],
		queryFn: () =>
			getAllSchedulePlans({
				fromDate: today,
				toDate: rangeEnd,
				includeSlots: true,
				pageSize: PAGE_SIZE,
			}),
		enabled: canSchedule,
	});

	const overviewQuery = useQuery({
		queryKey: ["dashboard", "resource-overview"],
		queryFn: fetchResourceOverview,
		enabled: canCatalog,
	});

	const plans = plansQuery.data ?? [];

	// 今日计划与今日号源汇总。
	const todayPlans = useMemo(
		() => plans.filter((plan) => plan.date === today),
		[plans, today],
	);
	const todaySummary = useMemo(() => summarizePlans(todayPlans), [todayPlans]);
	// 窗口汇总：用于「未来 7 天计划数」与趋势图。
	const rangeSummary = useMemo(() => summarizePlans(plans), [plans]);
	const daily = useMemo(
		() => summarizePlansByDate(plans, dates),
		[plans, dates],
	);
	// 今日待关注计划：约满 / 临近约满 / 未划分时段三类。
	const attention = useMemo(() => pickAttentionPlans(todayPlans), [todayPlans]);

	const todayUtilization = utilization(todaySummary);

	const trendOption = useMemo(() => buildSourceTrendOption(daily), [daily]);
	const doctorOption = useMemo(
		() => buildDoctorStatusOption(overviewQuery.data?.doctorCounts ?? []),
		[overviewQuery.data],
	);

	const refreshing = plansQuery.isFetching || overviewQuery.isFetching;
	const refreshAll = () => {
		// 只失效数据查询；会话结论由 lib/auth-session 自行管理缓存。
		void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
	};

	return (
		<main className="space-y-6 text-slate-800">
			{/* 页头：标题 + 统计口径 + 手动刷新 */}
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-xl font-semibold text-slate-900">运营总览</h1>
					<p className="mt-1 text-sm text-slate-500">
						业务日期 {today} {weekdayLabel(today)} · 统计窗口 {today} ~{" "}
						{rangeEnd}（含当天共 {RANGE_DAYS} 天）
					</p>
				</div>
				<Button onClick={refreshAll} disabled={refreshing}>
					<RefreshCw
						className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
					/>
					刷新
				</Button>
			</div>

			{/* KPI 卡片：今日排班与号源是唯一具备真实运营价值的一块数据 */}
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					icon={CalendarDays}
					label="今日出诊计划"
					value={settle(plansQuery, canSchedule, todaySummary.planCount)}
					hint={`已划分时段 ${todaySummary.slotCount} 个`}
				/>
				<StatCard
					icon={Ticket}
					label="今日可约号源"
					value={settle(plansQuery, canSchedule, todaySummary.bookable)}
					hint={`计划容量 ${todaySummary.maximum}（未划分时段的计划不计入可约）`}
				/>
				<StatCard
					icon={Percent}
					label="今日号源利用率"
					value={settle(
						plansQuery,
						canSchedule,
						formatPercent(todayUtilization),
					)}
					hint={`已用 ${todaySummary.used} / 容量 ${todaySummary.maximum}`}
				/>
				<StatCard
					icon={TrendingUp}
					label={`未来 ${RANGE_DAYS} 天计划`}
					value={settle(plansQuery, canSchedule, rangeSummary.planCount)}
					hint={`可约号源 ${rangeSummary.bookable}`}
				/>
			</div>

			{/* 图表区：左侧趋势，右侧医生规模结构 */}
			<div className="grid gap-4 xl:grid-cols-3">
				<Panel
					className="xl:col-span-2"
					title={`未来 ${RANGE_DAYS} 天号源趋势`}
					description="按出诊日期汇总：已用号源 + 可约余量；未划分时段的计划只计入已用。"
					action={
						<Link
							to="/dashboard/visiting/doctor-visits"
							className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
						>
							医生出诊表
							<ArrowRight className="h-3.5 w-3.5" />
						</Link>
					}
				>
					<SectionBody
						loading={plansQuery.isLoading && canSchedule}
						error={plansQuery.error}
						onRetry={() => void plansQuery.refetch()}
						denied={
							!canSchedule ? "需要 SCHEDULE:SELECT 权限才能查看排班数据" : null
						}
						empty={canSchedule && daily.every((item) => item.planCount === 0)}
						emptyText="统计窗口内没有任何出诊计划"
					>
						<EChart
							option={trendOption}
							className="h-72 w-full"
							ariaLabel={`未来 ${RANGE_DAYS} 天每日已用号源与可约余量柱状图`}
						/>
					</SectionBody>
				</Panel>

				<Panel
					title="医生规模结构"
					description="按医生在职状态统计，不含隐藏医生。"
					action={
						<Link
							to="/dashboard/nursing/doctor"
							className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
						>
							医生管理
							<ArrowRight className="h-3.5 w-3.5" />
						</Link>
					}
				>
					<SectionBody
						loading={overviewQuery.isLoading && canCatalog}
						error={overviewQuery.error}
						onRetry={() => void overviewQuery.refetch()}
						denied={
							!canCatalog ? "需要 CATALOG:SELECT 权限才能查看基础资料" : null
						}
						empty={
							canCatalog &&
							(overviewQuery.data?.doctorCounts ?? []).every(
								(item) => item.value === 0,
							)
						}
						emptyText="暂无医生数据"
					>
						<EChart
							option={doctorOption}
							className="h-48 w-full"
							ariaLabel="医生在职状态分布环形图"
						/>
						<ResourceRow overview={overviewQuery.data} />
					</SectionBody>
				</Panel>
			</div>

			{/* 待关注计划：Dashboard 里真正可行动的一块 */}
			<Panel
				title="今日待关注的计划"
				description="已约满、临近约满（利用率达到 80%）以及尚未划分时段的计划。"
				action={
					<Link
						to="/dashboard/visiting/schedule"
						className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
					>
						门诊日程表
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
			>
				<SectionBody
					loading={plansQuery.isLoading && canSchedule}
					error={plansQuery.error}
					onRetry={() => void plansQuery.refetch()}
					denied={
						!canSchedule ? "需要 SCHEDULE:SELECT 权限才能查看排班数据" : null
					}
					empty={canSchedule && attention.length === 0}
					emptyText="今日没有需要关注的计划"
				>
					<AttentionTable
						items={attention.slice(0, ATTENTION_LIMIT)}
						doctorNames={overviewQuery.data?.doctorNames}
						subdepartmentNames={overviewQuery.data?.subdepartmentNames}
					/>
					{attention.length > ATTENTION_LIMIT ? (
						<p className="mt-3 text-xs text-slate-400">
							另有 {attention.length - ATTENTION_LIMIT}{" "}
							条待关注计划，可在门诊日程表中查看全部。
						</p>
					) : null}
				</SectionBody>
			</Panel>

			{/* 诚实占位：明确列出尚未接入的模块，避免用假数据填满首页 */}
			<Panel
				title="尚未接入的模块"
				description="以下能力属于后续切片，当前页面保留入口但不展示数据。"
			>
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
					<PendingModule
						to="/dashboard/nursing/nurse"
						label="护士管理"
						note="页面待实现"
					/>
					<PendingModule
						to="/dashboard/nursing/caregiver"
						label="护工管理"
						note="页面待实现"
					/>
					<PendingModule
						to="/dashboard/nursing/consultation-fee"
						label="诊费设置"
						note="页面待实现"
					/>
					<PendingModule
						to="/dashboard/visiting/video-consultation"
						label="视频问诊"
						note="Slice 7"
					/>
					<PendingModule
						label="挂号与支付"
						note="后端接口未实现（Slice 5/6）"
					/>
				</div>
			</Panel>
		</main>
	);
}

// KPI 数值兜底：无权限时显示「-」，加载中显示「…」，避免把 0 误当成真实统计结果。
function settle(
	query: { isLoading: boolean },
	enabled: boolean,
	value: number | string,
): string {
	if (!enabled) return "-";
	if (query.isLoading) return "…";
	return String(value);
}

// 面板容器：统一标题、描述、右上角入口与内容区样式。
function Panel({
	title,
	description,
	action,
	className = "",
	children,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<section
			className={`rounded-md border border-slate-200 bg-white p-4 shadow-sm ${className}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<h2 className="text-sm font-semibold text-slate-800">{title}</h2>
					{description ? (
						<p className="mt-1 text-xs text-slate-400">{description}</p>
					) : null}
				</div>
				{action}
			</div>
			<div className="mt-3">{children}</div>
		</section>
	);
}

// 区块状态包装：统一处理加载中、接口失败、无权限、无数据四种情况，
// 只有全部通过后才渲染图表或表格，避免各区块重复写四套分支。
function SectionBody({
	loading,
	error,
	onRetry,
	denied,
	empty,
	emptyText,
	children,
}: {
	loading: boolean;
	error: unknown;
	onRetry: () => void;
	denied: string | null;
	empty: boolean;
	emptyText: string;
	children: ReactNode;
}) {
	if (denied) {
		return (
			<Placeholder tone="denied" text={denied}>
				<Info className="h-4 w-4" />
			</Placeholder>
		);
	}
	if (loading) {
		return <Placeholder tone="muted" text="加载中…" />;
	}
	if (error) {
		return (
			<Placeholder tone="error" text={getApiErrorMessage(error)}>
				<Button onClick={onRetry}>重试</Button>
			</Placeholder>
		);
	}
	if (empty) {
		return <Placeholder tone="muted" text={emptyText} />;
	}
	return <>{children}</>;
}

// 区块占位内容：图标 + 文案 + 可选操作，高度与图表区接近，避免状态切换时页面跳动。
function Placeholder({
	tone,
	text,
	children,
}: {
	tone: "muted" | "denied" | "error";
	text: string;
	children?: ReactNode;
}) {
	const toneClass =
		tone === "error"
			? "text-red-600"
			: tone === "denied"
				? "text-amber-600"
				: "text-slate-400";
	return (
		<div
			className={`flex min-h-40 flex-col items-center justify-center gap-2 px-4 text-center text-sm ${toneClass}`}
		>
			{children ? (
				<span className="flex items-center gap-1.5">
					{children}
					<span>{text}</span>
				</span>
			) : (
				<span>{text}</span>
			)}
		</div>
	);
}

// KPI 卡片：左上角标题、右侧图标、下方数值与口径说明。
function StatCard({
	icon: Icon,
	label,
	value,
	hint,
}: {
	icon: typeof CalendarDays;
	label: string;
	value: string;
	hint: string;
}) {
	return (
		<div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-center justify-between gap-2">
				<p className="text-xs font-medium text-slate-500">{label}</p>
				<Icon className="h-4 w-4 shrink-0 text-slate-400" />
			</div>
			<p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
			<p className="mt-1 text-xs text-slate-400">{hint}</p>
		</div>
	);
}

// 资源规模行：科室 / 子科室数量，数据来自基础资料域选项接口。
function ResourceRow({ overview }: { overview?: ResourceOverview }) {
	return (
		<div className="mt-2 grid grid-cols-2 gap-2">
			<div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
				<Building2 className="h-4 w-4 text-slate-400" />
				<span className="text-xs text-slate-500">科室</span>
				<span className="ml-auto text-sm font-semibold text-slate-800">
					{overview ? overview.departmentCount : "…"}
				</span>
			</div>
			<div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
				<Stethoscope className="h-4 w-4 text-slate-400" />
				<span className="text-xs text-slate-500">子科室</span>
				<span className="ml-auto text-sm font-semibold text-slate-800">
					{overview ? overview.subdepartmentCount : "…"}
				</span>
			</div>
		</div>
	);
}

// 待关注计划表：突出「可约余量」与原因标签，医生/子科室名称缺失时回退为编号。
function AttentionTable({
	items,
	doctorNames,
	subdepartmentNames,
}: {
	items: ReturnType<typeof pickAttentionPlans>;
	doctorNames?: Map<number, string>;
	subdepartmentNames?: Map<number, string>;
}) {
	return (
		<div className="overflow-x-auto">
			<table className="min-w-160 w-full text-left text-sm">
				<thead className="bg-slate-50 text-xs font-semibold text-slate-500">
					<tr>
						<TableHeader>日期</TableHeader>
						<TableHeader>子科室</TableHeader>
						<TableHeader>医生</TableHeader>
						<TableHeader>号源（已用/容量）</TableHeader>
						<TableHeader>可约余量</TableHeader>
						<TableHeader>原因</TableHeader>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-100">
					{items.map((item) => (
						<tr key={item.plan.id} className="transition hover:bg-blue-50/40">
							<td className="whitespace-nowrap px-4 py-3 text-slate-700">
								{item.plan.date}
								<span className="ml-1.5 text-xs text-slate-400">
									{weekdayLabel(item.plan.date)}
								</span>
							</td>
							<td className="px-4 py-3 text-slate-700">
								{subdepartmentNames?.get(item.plan.subdepartmentId) ??
									`子科室 #${item.plan.subdepartmentId}`}
							</td>
							<td className="px-4 py-3 text-slate-700">
								{doctorNames?.get(item.plan.doctorId) ??
									`医生 #${item.plan.doctorId}`}
							</td>
							<td className="whitespace-nowrap px-4 py-3 text-slate-700">
								{item.plan.used} / {item.plan.maximum}
							</td>
							<td className="px-4 py-3">
								<span
									className={
										item.bookable > 0
											? "text-slate-700"
											: "font-medium text-red-600"
									}
								>
									{item.bookable}
								</span>
							</td>
							<td className="px-4 py-3">
								<span
									className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium ${ATTENTION_STYLES[item.kind]}`}
								>
									{item.kind === "NO_SLOTS" ? null : (
										<AlertTriangle className="h-3.5 w-3.5" />
									)}
									{ATTENTION_LABELS[item.kind]}
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function TableHeader({ children }: { children: string }) {
	return <th className="whitespace-nowrap px-4 py-3">{children}</th>;
}

// 待接入模块卡片：有页面的给出入口，没有页面的只做说明，避免出现无法跳转的链接。
function PendingModule({
	to,
	label,
	note,
}: {
	to?:
		| "/dashboard/nursing/nurse"
		| "/dashboard/nursing/caregiver"
		| "/dashboard/nursing/consultation-fee"
		| "/dashboard/visiting/video-consultation";
	label: string;
	note: string;
}) {
	const body = (
		<>
			<p className="text-sm font-medium text-slate-700">{label}</p>
			<p className="mt-1 text-xs text-slate-400">{note}</p>
		</>
	);

	if (!to) {
		return (
			<div className="rounded-md border border-dashed border-slate-200 bg-slate-50/60 p-3">
				{body}
			</div>
		);
	}

	return (
		<Link
			to={to}
			className="rounded-md border border-slate-200 bg-white p-3 transition hover:border-blue-300 hover:bg-blue-50/40"
		>
			{body}
		</Link>
	);
}

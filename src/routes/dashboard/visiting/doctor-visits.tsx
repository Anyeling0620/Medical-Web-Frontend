import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Info, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
// 医生目录接口（规范 11.2）：科室/子科室下拉与医生名称映射的数据源。
import { getDoctorOptions, getDoctorsList } from "@/api/doctors";
// 排班域接口（规范 5.1）：出诊计划查询；includeSlots=true 时每项带 slots 数组。
import {
	getSchedulePlans,
	type ScheduleSlot,
	type WorkPlan,
} from "@/api/schedule";
import { showMessage } from "@/components/message-popup";
import { Button, Field, inputClassName, SelectInput } from "@/components/ui";
import { getApiErrorMessage } from "@/lib/api-error";
import { shiftDateYMD, todayYMD, weekdayLabel } from "@/lib/date";

export const Route = createFileRoute("/dashboard/visiting/doctor-visits")({
	component: DoctorVisitsPage,
});

// 规范 1.4：列表接口 pageSize 上限为 100，服务端最多返回 100 条，
// 因此 total 超过该值时必须提示用户缩小日期范围。
const PAGE_SIZE = 100;
// 默认查询窗口：今天起 14 天（含当天），与常用排班周期保持一致。
const DEFAULT_RANGE_DAYS = 14;

// 页面筛选条件：草稿条件与生效条件共用同一结构。
interface VisitFilter {
	departmentId?: number;
	subdepartmentId?: number;
	doctorId?: number;
	// 规范 1.1：日期按业务语义使用 YYYY-MM-DD。
	fromDate: string;
	toDate: string;
}

// 单个医生的出诊计划聚合结果：分组在前端完成，不额外请求接口。
interface DoctorVisitGroup {
	doctorId: number;
	// 该医生的计划，按日期升序。
	plans: WorkPlan[];
	// 该医生涉及的子科室 id（去重），用于展示子科室名称。
	subdepartmentIds: number[];
	// 号源合计：已用 / 总量 / 剩余。
	used: number;
	maximum: number;
	remaining: number;
	// 时段条数合计，用于顶部概览。
	slotCount: number;
}

// 构造默认筛选条件：日期范围为今天 ~ 今天 + 14 天，下拉条件为空（全部）。
function createDefaultFilter(): VisitFilter {
	const today = todayYMD();
	return {
		fromDate: today,
		toDate: shiftDateYMD(today, DEFAULT_RANGE_DAYS),
	};
}

/**
 * 医生出诊表：医生维度的只读出诊计划视图。
 * 数据来自规范 5.1 GET /api/v1/schedule/plans（includeSlots=true），
 * 页面只做筛选、分组与展示，不发起任何写操作。
 */
function DoctorVisitsPage() {
	// 表单「草稿」条件：编辑控件只更新草稿，点击「查询」后才生效并发起请求。
	const [draftFilter, setDraftFilter] =
		useState<VisitFilter>(createDefaultFilter);
	// 点击「查询」后真正生效的条件：作为 queryKey 的一部分触发重新请求。
	const [appliedFilter, setAppliedFilter] =
		useState<VisitFilter>(createDefaultFilter);
	// 医生 id -> 姓名映射：累积历次医生列表结果，避免切换筛选后已渲染的医生名回退成「医生 #id」。
	const [doctorNames, setDoctorNames] = useState<Record<number, string>>({});

	// GET /api/v1/catalog/doctors/options（规范 11.2）：子科室 id -> 名称映射，用于卡片副标题。
	const optionsQuery = useQuery({
		queryKey: ["doctor-options"],
		queryFn: getDoctorOptions,
	});

	// GET /api/v1/catalog/doctors（规范 11.2）：医生下拉数据源，pageSize 固定 100（规范 1.4 上限），
	// 按草稿中的科室/子科室联动过滤，保证下拉候选与已选范围一致。
	const doctorsQuery = useQuery({
		queryKey: [
			"schedule-visit-doctors",
			draftFilter.departmentId,
			draftFilter.subdepartmentId,
		],
		queryFn: () =>
			getDoctorsList({
				departmentId: draftFilter.departmentId,
				subdepartmentId: draftFilter.subdepartmentId,
				page: 1,
				pageSize: PAGE_SIZE,
			}),
	});
	const doctors = doctorsQuery.data?.items ?? [];

	// 增量合并医生姓名映射：只补齐不覆盖，保证已展示的医生名不丢失。
	useEffect(() => {
		const items = doctorsQuery.data?.items;
		if (!items || items.length === 0) return;
		setDoctorNames((prev) => {
			const next = { ...prev };
			for (const doctor of items) {
				next[doctor.id] = doctor.name;
			}
			return next;
		});
	}, [doctorsQuery.data]);

	const departments = optionsQuery.data?.departments ?? [];
	// 子科室按草稿中的科室过滤；未选科室时展示全部，与医生管理页的联动方式保持一致。
	const subdepartments = (optionsQuery.data?.subdepartments ?? []).filter(
		(sub) =>
			draftFilter.departmentId == null ||
			sub.departmentId === draftFilter.departmentId,
	);
	// 子科室 id -> 名称映射：基于全量子科室构建，未出现在当前下拉中的也能显示名称。
	const subdepartmentNames = useMemo(() => {
		const names: Record<number, string> = {};
		for (const sub of optionsQuery.data?.subdepartments ?? []) {
			names[sub.id] = sub.name;
		}
		return names;
	}, [optionsQuery.data]);

	// GET /api/v1/schedule/plans（规范 5.1）：一次拉取当前条件下的计划及其时段；
	// includeSlots=true 时每项带 slots 数组，因此无需再逐条调用时段接口。
	// 规范 1.4：pageSize 最大 100；按 date 升序返回，便于按医生分组后顺序展示。
	const plansQuery = useQuery({
		queryKey: [
			"schedule-plans",
			appliedFilter.departmentId,
			appliedFilter.subdepartmentId,
			appliedFilter.doctorId,
			appliedFilter.fromDate,
			appliedFilter.toDate,
		],
		queryFn: () =>
			getSchedulePlans({
				departmentId: appliedFilter.departmentId,
				subdepartmentId: appliedFilter.subdepartmentId,
				doctorId: appliedFilter.doctorId,
				fromDate: appliedFilter.fromDate || undefined,
				toDate: appliedFilter.toDate || undefined,
				includeSlots: true,
				page: 1,
				pageSize: PAGE_SIZE,
				sort: "date",
				order: "asc",
			}),
	});
	const plans = plansQuery.data?.items ?? [];
	const total = plansQuery.data?.total ?? 0;

	// 前端按医生分组；组内再按日期升序、id 升序做稳定排序，保证展示顺序确定。
	const groups = useMemo<DoctorVisitGroup[]>(() => {
		const map = new Map<number, DoctorVisitGroup>();
		const sorted = [...plans].sort((left, right) => {
			if (left.date === right.date) return left.id - right.id;
			return left.date < right.date ? -1 : 1;
		});
		for (const plan of sorted) {
			let group = map.get(plan.doctorId);
			if (!group) {
				group = {
					doctorId: plan.doctorId,
					plans: [],
					subdepartmentIds: [],
					used: 0,
					maximum: 0,
					remaining: 0,
					slotCount: 0,
				};
				map.set(plan.doctorId, group);
			}
			group.plans.push(plan);
			if (!group.subdepartmentIds.includes(plan.subdepartmentId)) {
				group.subdepartmentIds.push(plan.subdepartmentId);
			}
			group.used += plan.used;
			group.maximum += plan.maximum;
			group.remaining += plan.remaining;
			group.slotCount += plan.slots?.length ?? 0;
		}
		return [...map.values()];
	}, [plans]);

	// 顶部概览：时段总数与剩余号源合计由分组结果直接汇总。
	const slotTotal = groups.reduce((sum, group) => sum + group.slotCount, 0);
	const remainingTotal = groups.reduce(
		(sum, group) => sum + group.remaining,
		0,
	);

	// 点击「查询」：前端先校验日期区间（规范 5.1 要求 fromDate <= toDate，否则后端返回 422），
	// 校验通过后才提交为生效条件。
	const handleSearch = () => {
		const { fromDate, toDate } = draftFilter;
		// 日期必填：清空日期会让请求退化成「最早的 100 条」，与按周查看出诊的预期不符。
		if (!fromDate || !toDate) {
			showMessage("warn", "请选择开始日期与结束日期");
			return;
		}
		if (fromDate > toDate) {
			showMessage("warn", "开始日期不能晚于结束日期");
			return;
		}
		setAppliedFilter({ ...draftFilter });
	};

	// 点击「重置」：恢复默认日期范围并清空下拉条件，同时提交生效条件。
	const handleReset = () => {
		const next = createDefaultFilter();
		setDraftFilter(next);
		setAppliedFilter(next);
	};

	return (
		<main className="min-h-screen bg-[#f5f7fb]">
			<div className="mx-auto max-w-[1600px] space-y-4">
				{/* 筛选栏：仅点击「查询」后才提交条件并请求接口 */}
				<section className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex flex-wrap items-end gap-3">
						<div className="w-44">
							<Field label="科室">
								<SelectInput
									value={draftFilter.departmentId?.toString() ?? ""}
									onChange={(event) => {
										const value = event.target.value;
										// 切换科室时清空已选子科室与医生，避免跨科室误选。
										setDraftFilter((prev) => ({
											...prev,
											departmentId: value ? Number(value) : undefined,
											subdepartmentId: undefined,
											doctorId: undefined,
										}));
									}}
								>
									<option value="">全部科室</option>
									{departments.map((department) => (
										<option key={department.id} value={String(department.id)}>
											{department.name}
										</option>
									))}
								</SelectInput>
							</Field>
						</div>
						<div className="w-44">
							<Field label="子科室">
								<SelectInput
									value={draftFilter.subdepartmentId?.toString() ?? ""}
									onChange={(event) => {
										const value = event.target.value;
										// 切换子科室时清空医生，保证医生候选与该子科室一致。
										setDraftFilter((prev) => ({
											...prev,
											subdepartmentId: value ? Number(value) : undefined,
											doctorId: undefined,
										}));
									}}
								>
									<option value="">全部子科室</option>
									{subdepartments.map((subdepartment) => (
										<option
											key={subdepartment.id}
											value={String(subdepartment.id)}
										>
											{subdepartment.name}
										</option>
									))}
								</SelectInput>
							</Field>
						</div>
						<div className="w-52">
							<Field label="医生">
								<SelectInput
									value={draftFilter.doctorId?.toString() ?? ""}
									onChange={(event) => {
										const value = event.target.value;
										setDraftFilter((prev) => ({
											...prev,
											doctorId: value ? Number(value) : undefined,
										}));
									}}
								>
									<option value="">全部医生</option>
									{doctors.map((doctor) => (
										<option key={doctor.id} value={String(doctor.id)}>
											{doctor.name}
										</option>
									))}
								</SelectInput>
							</Field>
						</div>
						<div className="w-40">
							<Field label="开始日期">
								<input
									type="date"
									className={inputClassName}
									value={draftFilter.fromDate}
									onChange={(event) =>
										setDraftFilter((prev) => ({
											...prev,
											fromDate: event.target.value,
										}))
									}
								/>
							</Field>
						</div>
						<div className="w-40">
							<Field label="结束日期">
								<input
									type="date"
									className={inputClassName}
									value={draftFilter.toDate}
									onChange={(event) =>
										setDraftFilter((prev) => ({
											...prev,
											toDate: event.target.value,
										}))
									}
								/>
							</Field>
						</div>
						<Button variant="primary" onClick={handleSearch}>
							<Search className="h-4 w-4" />
							查询
						</Button>
						<Button onClick={handleReset}>
							<RotateCcw className="h-4 w-4" />
							重置
						</Button>
					</div>

					{/* 只读提示：本页只展示出诊计划，不提供任何新增/修改/删除入口 */}
					<span className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-500">
						<Info className="h-4 w-4" />
						只读出诊计划视图
					</span>
				</section>

				{/* 规范 1.4：pageSize 上限 100，命中上限时提示缩小日期范围 */}
				{total > PAGE_SIZE && (
					<div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
						<AlertTriangle className="h-4 w-4 shrink-0" />
						结果超过 {PAGE_SIZE} 条，仅展示前 {PAGE_SIZE} 条，请缩小日期范围
					</div>
				)}

				{/* 顶部概览：计划总数 / 时段总数 / 剩余号源合计 */}
				<section className="grid gap-4 sm:grid-cols-3">
					<StatCard label="计划总数" value={plans.length} />
					<StatCard label="时段总数" value={slotTotal} />
					<StatCard label="剩余号源合计" value={remainingTotal} />
				</section>

				<section className="flex h-14 items-center justify-between rounded-md border border-slate-200 bg-white px-4 shadow-sm">
					<div className="flex items-center gap-3">
						<span className="text-sm font-medium text-slate-700">
							医生出诊表
						</span>
						<span className="text-xs text-slate-400">
							共 {total} 条计划，涉及 {groups.length} 位医生
						</span>
					</div>
				</section>

				{/* 加载中 */}
				{plansQuery.isLoading && (
					<section className="rounded-md border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400 shadow-sm">
						出诊计划加载中...
					</section>
				)}

				{/* 请求失败：按规范 1.3 的错误结构展示后端 message */}
				{!plansQuery.isLoading && plansQuery.isError && (
					<section className="space-y-3 rounded-md border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
						<p className="text-sm text-red-600">
							{getApiErrorMessage(plansQuery.error)}
						</p>
						<Button onClick={() => plansQuery.refetch()}>重试</Button>
					</section>
				)}

				{/* 空数据：提示写法参考医生管理页的 TableMessage */}
				{!plansQuery.isLoading &&
					!plansQuery.isError &&
					groups.length === 0 && (
						<section className="rounded-md overflow-hidden border border-slate-200 bg-white shadow-sm">
							<div className="overflow-x-auto">
								<table className="w-full text-left text-sm">
									<tbody>
										<TableMessage colSpan={5}>
											当前条件下暂无出诊计划
										</TableMessage>
									</tbody>
								</table>
							</div>
						</section>
					)}

				{/* 按医生分组展示：每人一张卡片，卡片内按日期升序展示计划 */}
				{!plansQuery.isLoading &&
					!plansQuery.isError &&
					groups.map((group) => (
						<section
							key={group.doctorId}
							className="rounded-md overflow-hidden border border-slate-200 bg-white shadow-sm"
						>
							<div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
								<div className="flex flex-wrap items-baseline gap-3">
									<h2 className="text-base font-semibold text-slate-800">
										{doctorNames[group.doctorId] ?? `医生 #${group.doctorId}`}
									</h2>
									<span className="text-xs text-slate-400">
										{buildGroupSummary(group, subdepartmentNames)}
									</span>
								</div>
								<span className="text-xs text-slate-400">
									共 {group.plans.length} 条计划
								</span>
							</div>
							<div className="overflow-x-auto">
								<table className="min-w-200 w-full text-left text-sm">
									<thead className="bg-slate-50 text-xs font-semibold text-slate-500">
										<tr>
											<TableHeader>日期</TableHeader>
											<TableHeader>时段</TableHeader>
											<TableHeader>计划号源（已用/最大）</TableHeader>
											<TableHeader>剩余</TableHeader>
											<TableHeader>状态</TableHeader>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{group.plans.map((plan) => (
											<tr
												key={plan.id}
												className="transition hover:bg-blue-50/40"
											>
												<td className="whitespace-nowrap px-4 py-3 text-slate-700">
													{plan.date}
													<span className="ml-1.5 text-xs text-slate-400">
														{weekdayLabel(plan.date)}
													</span>
												</td>
												<td className="px-4 py-3">
													<SlotTags slots={plan.slots} />
												</td>
												<td className="whitespace-nowrap px-4 py-3 text-slate-700">
													{plan.used} / {plan.maximum}
												</td>
												<td className="px-4 py-3">
													<span
														className={
															plan.remaining > 0
																? "text-slate-700"
																: "font-medium text-red-600"
														}
													>
														{plan.remaining}
													</span>
												</td>
												<td className="px-4 py-3">
													<StatusBadge remaining={plan.remaining} />
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</section>
					))}
			</div>
		</main>
	);
}

// 顶部概览小卡片：展示单项汇总数字。
function StatCard({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
			<p className="text-xs font-medium text-slate-500">{label}</p>
			<p className="mt-1 text-2xl font-semibold text-slate-800">{value}</p>
		</div>
	);
}

// 表头单元格：统一表头样式。
function TableHeader({ children }: { children: string }) {
	return <th className="whitespace-nowrap px-4 py-3">{children}</th>;
}

// 表格空状态提示行：写法与医生管理页的 TableMessage 保持一致。
function TableMessage({
	children,
	colSpan,
}: {
	children: string;
	colSpan: number;
}) {
	return (
		<tr>
			<td
				colSpan={colSpan}
				className="px-4 py-12 text-center text-sm text-slate-400"
			>
				{children}
			</td>
		</tr>
	);
}

// 计划状态标签：remaining 为 0 表示号源已约满，否则可约。
function StatusBadge({ remaining }: { remaining: number }) {
	if (remaining === 0) {
		return (
			<span className="inline-flex bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
				已满
			</span>
		);
	}
	return (
		<span className="inline-flex bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
			可约
		</span>
	);
}

// 时段标签：展示「{序号}时段 剩余/最大」，title 提供剩余/已用/最大的完整信息便于悬浮查看；
// 计划未划分时段时显示占位提示。
function SlotTags({ slots }: { slots?: ScheduleSlot[] }) {
	// 接口已按 slot 升序返回，这里再排序一次保证展示顺序稳定。
	const sorted = [...(slots ?? [])].sort(
		(left, right) => left.slot - right.slot,
	);
	if (sorted.length === 0) {
		return (
			<span className="text-xs text-slate-400" title="该计划尚未划分时段">
				-（未划分时段）
			</span>
		);
	}
	return (
		<div className="flex flex-wrap gap-1.5">
			{sorted.map((slot) => (
				<span
					key={slot.id}
					title={`${slot.slot}时段：剩余 ${slot.remaining}，已用 ${slot.used}，最大 ${slot.maximum}`}
					className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${
						slot.remaining > 0
							? "bg-blue-50 text-blue-700"
							: "bg-red-50 text-red-600"
					}`}
				>
					{slot.slot}时段 {slot.remaining}/{slot.maximum}
				</span>
			))}
		</div>
	);
}

// 卡片副标题：子科室名称 + 计划数 + 号源合计（已用/总量、剩余）。
function buildGroupSummary(
	group: DoctorVisitGroup,
	subdepartmentNames: Record<number, string>,
): string {
	const names = group.subdepartmentIds
		.map((id) => subdepartmentNames[id] ?? `子科室 #${id}`)
		.join(" / ");
	return `${names} · 计划 ${group.plans.length} 条 · 号源 ${group.used}/${group.maximum}，剩余 ${group.remaining}`;
}

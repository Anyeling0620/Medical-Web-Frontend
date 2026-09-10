// 门诊日程表（出诊管理）：按「自然周 × 诊室」矩阵展示出诊计划，单元格为该诊室当天出诊的医生姓名。
// 契约来源：spec/04-api-contract.md 5.1 ~ 5.5（排班域 /schedule）与 12.3（排班接口 JSON 示例）。
// 设计说明：后端只提供按日期区间/科室/医生过滤的计划列表（规范 5.1，fromDate/toDate 为闭区间），
// 因此本页在前端把一周计划聚合成矩阵；当周条数超过单次可取的 100 条时提示用户收窄范围（规范 1.4 pageSize 上限 100）。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Plus,
	Search,
	ZoomIn,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	type DepartmentOption,
	getAllDoctors,
	getAllDoctorsIncludingInactive,
	getDoctorDetail,
	getDoctorOptions,
	type SubdepartmentOption,
} from "@/api/doctors";
import {
	type CreateSlotRequest,
	createIdempotencyKey,
	createSchedulePlan,
	createSchedulePlanSlot,
	deleteSchedulePlan,
	deleteScheduleSlot,
	getSchedulePlanSlots,
	getSchedulePlans,
	type ScheduleSlot,
	updateSchedulePlanMaximum,
	updateScheduleSlotMaximum,
	type WorkPlan,
} from "@/api/schedule";
import { showMessage } from "@/components/message-popup";
import {
	Button,
	ConfirmDialog,
	Field,
	FormError,
	inputClassName,
	Modal,
	NumberInput,
	SelectInput,
	TextInput,
} from "@/components/ui";
import { getApiErrorMessage, isApiError } from "@/lib/api-error";
import { shiftDateYMD, todayYMD, weekdayLabel } from "@/lib/date";

export const Route = createFileRoute("/dashboard/visiting/schedule")({
	component: ScheduleMatrixPage,
});

// 规范 1.4：列表 pageSize 上限为 100，矩阵一次拉取整周计划，超出时给出提示。
const MATRIX_PAGE_SIZE = 100;
// 规范 5.2 / 5.3 / 5.5：计划与时段的最大号源上限（1..32767）。
const CAPACITY_MAX = 32767;
// 「新增」弹窗中「时段人数」的取值范围（原型：滑块 1..50，默认 3）。
const SLOT_CAPACITY_MIN = 1;
const SLOT_CAPACITY_MAX = 50;
const SLOT_CAPACITY_DEFAULT = 3;
// 矩阵固定 7 列：周一 ~ 周日。
const DAY_COUNT = 7;

// 可选出诊时段（半小时间隔）：顺序与原型图一致，同时用于 slot 编号映射。
// 规范 2.2 / 5.5：后端 slot 只是整数时段标识、没有时间语义，这里用数组下标 + 1 建立稳定映射。
const OUTPATIENT_TIME_SLOTS = [
	"08:00~08:30",
	"08:30~09:00",
	"09:00~09:30",
	"09:30~10:00",
	"10:00~10:30",
	"10:30~11:00",
	"11:00~11:30",
	"11:30~12:00",
	"13:00~13:30",
	"13:30~14:00",
	"14:00~14:30",
	"14:30~15:00",
	"15:00~15:30",
	"16:00~16:30",
	"16:30~17:00",
];

// 筛选条件：date 决定所在自然周；departmentId 由服务端过滤；
// doctorName 只能在前端过滤（规范 5.1 没有姓名参数），因此不参与请求。
interface MatrixFilter {
	departmentId?: number;
	date: string;
	doctorName: string;
}

// 默认筛选：今天所在周、全部科室、无姓名过滤。
function createDefaultFilter(): MatrixFilter {
	return { departmentId: undefined, date: todayYMD(), doctorName: "" };
}

// 把 YYYY-MM-DD 解析为本地时间 Date，避免 new Date("YYYY-MM-DD") 被按 UTC 解析造成跨日偏差。
function parseYMD(value: string): Date {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year, (month ?? 1) - 1, day ?? 1);
}

// 本周周一：周一 = 选中日期 - ((getDay() + 6) % 7) 天（getDay()：周日=0 … 周六=6）。
function mondayOfWeek(dateYMD: string): string {
	const offset = (parseYMD(dateYMD).getDay() + 6) % 7;
	return shiftDateYMD(dateYMD, -offset);
}

// 本周 7 天的日期数组（周一 → 周日），与表头 7 列一一对应。
function weekDates(mondayYMD: string): string[] {
	return Array.from({ length: DAY_COUNT }, (_item, index) =>
		shiftDateYMD(mondayYMD, index),
	);
}

// 「10月10日」：表头文案的日期部分。
function formatMonthDay(dateYMD: string): string {
	const date = parseYMD(dateYMD);
	return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// weekdayLabel() 返回「周一」这类文案，表头需要「星期一」形式，这里做一次映射。
function toChineseWeekday(dateYMD: string): string {
	return weekdayLabel(dateYMD).replace("周", "星期");
}

// 表头单元格文案：10月10日（星期一）。
function formatDayHeader(dateYMD: string): string {
	return `${formatMonthDay(dateYMD)}（${toChineseWeekday(dateYMD)}）`;
}

// 周区间文案：2026年10月05日 ~ 10月11日，用于矩阵标题右侧展示当前周。
function formatWeekRange(mondayYMD: string): string {
	const start = parseYMD(mondayYMD);
	const end = parseYMD(shiftDateYMD(mondayYMD, DAY_COUNT - 1));
	const pad = (value: number) => `${value}`.padStart(2, "0");
	const startLabel = `${start.getFullYear()}年${pad(start.getMonth() + 1)}月${pad(start.getDate())}日`;
	const endLabel = `${pad(end.getMonth() + 1)}月${pad(end.getDate())}日`;
	// 跨年周（如 12月29日 ~ 1月4日）补上结束年份，避免把下一年的日期误读成今年。
	const endFullLabel =
		end.getFullYear() === start.getFullYear()
			? endLabel
			: `${end.getFullYear()}年${endLabel}`;
	return `${startLabel} ~ ${endFullLabel}`;
}

// 矩阵单元格键：诊室（子科室） + 日期，用于把计划聚合到格子中。
function cellKey(subdepartmentId: number, date: string): string {
	return `${subdepartmentId}|${date}`;
}

// 「新增」弹窗的默认日期：当前查询周第一天与今天中的较晚者（规范 5.2：写入只允许未来日期）。
function defaultPlanDate(mondayYMD: string): string {
	const today = todayYMD();
	return mondayYMD > today ? mondayYMD : today;
}

// 时段人数范围收敛：滑块与步进器共用，避免出现越界值。
function clampCapacity(value: number): number {
	if (!Number.isFinite(value)) return SLOT_CAPACITY_DEFAULT;
	return Math.min(
		SLOT_CAPACITY_MAX,
		Math.max(SLOT_CAPACITY_MIN, Math.round(value)),
	);
}

// 解析时段表单文本为整数：只接受纯数字，其余（空串、小数、符号）返回 null。
function parseSlotInteger(value: string): number | null {
	const text = value.trim();
	if (!/^\d+$/.test(text)) return null;
	const parsed = Number(text);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

// 删除计划失败文案（规范 5.4 DELETE /schedule/plans/{planId}）。
function describePlanDeleteError(error: unknown): string {
	if (isApiError(error)) {
		// 已有挂号记录时不允许物理删除。
		if (error.code === "SCHEDULE_HAS_REGISTRATIONS")
			return "已有挂号记录，不能删除";
		if (error.code === "SCHEDULE_PLAN_LOCKED") return "计划已开始，不能删除";
	}
	return getApiErrorMessage(error);
}

// 新增时段失败文案（规范 5.5 POST /schedule/plans/{planId}/slots）。
function describeSlotCreateError(error: unknown): string {
	if (isApiError(error) && error.code === "SCHEDULE_SLOT_EXISTS") {
		return "该时段已存在";
	}
	return getApiErrorMessage(error);
}

// 修改时段容量失败文案（规范 5.5 PATCH /schedule/slots/{slotId}）。
function describeSlotUpdateError(error: unknown): string {
	if (isApiError(error)) {
		if (error.code === "SCHEDULE_CAPACITY_INVALID")
			return "最大号源不能小于已用号源";
		if (error.code === "SCHEDULE_SLOT_LOCKED")
			return "计划已开始，不能修改时段";
	}
	return getApiErrorMessage(error);
}

// 删除时段失败文案（规范 5.5 DELETE /schedule/slots/{slotId}）。
function describeSlotDeleteError(error: unknown): string {
	if (isApiError(error) && error.code === "SCHEDULE_HAS_REGISTRATIONS") {
		return "已有挂号记录，不能删除时段";
	}
	return getApiErrorMessage(error);
}

// 表格占位行：加载中 / 加载失败 / 空数据共用，样式与医生管理页保持一致。
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

// 筛选栏字段容器：与医生管理页的筛选栏标签样式保持一致。
function FilterField({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	// 字段名用 div + span 呈现：具体控件由调用方传入，避免 label 与控件重复关联。
	return (
		<div className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
			<span>{label}</span>
			{children}
		</div>
	);
}

// 筛选下拉框：带右侧箭头图标，options 使用 { value, label }。
function FilterSelect({
	value,
	onChange,
	options,
}: {
	value: string;
	onChange: (value: string) => void;
	options: { value: string; label: string }[];
}) {
	return (
		<span className="relative inline-block">
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="h-10 w-44 appearance-none rounded-md border border-slate-200 bg-white px-3 pr-9 text-sm font-normal text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
			<ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
		</span>
	);
}

// 门诊日程表页面：筛选栏 + 周矩阵 + 新增/明细弹窗。
function ScheduleMatrixPage() {
	const queryClient = useQueryClient();
	// 草稿筛选条件：编辑控件时只改草稿，点击「查询」才生效。
	const [draftFilter, setDraftFilter] =
		useState<MatrixFilter>(createDefaultFilter);
	// 生效筛选条件：参与 queryKey，决定实际请求与矩阵内容。
	const [appliedFilter, setAppliedFilter] =
		useState<MatrixFilter>(createDefaultFilter);
	// 选中的矩阵单元格（诊室 + 日期），非空时打开「出诊明细」弹窗。
	const [detailCell, setDetailCell] = useState<{
		subdepartmentId: number;
		date: string;
	} | null>(null);
	// 「新增」弹窗开关。
	const [createOpen, setCreateOpen] = useState(false);

	// GET /api/v1/catalog/doctors/options：科室与子科室下拉数据。
	const optionsQuery = useQuery({
		queryKey: ["doctor-options"],
		queryFn: getDoctorOptions,
	});
	const departments: DepartmentOption[] = optionsQuery.data?.departments ?? [];
	const subdepartments: SubdepartmentOption[] =
		optionsQuery.data?.subdepartments ?? [];

	// GET /api/v1/catalog/doctors：用于 doctorId -> 姓名映射；全量拉取（分页取完）且包含离职/退休医生，
	// 否则医生总数超过单页上限、或医生已离职时会退化成「医生 #id」。
	// 刻意不按科室过滤：矩阵单元格要展示当前所有计划的医生姓名，而筛选栏的科室是「点击查询才生效」的
	// 草稿条件；若跟随草稿条件切换查询，映射会短暂为空，已渲染的姓名将退化成「医生 #id」。
	const doctorsQuery = useQuery({
		queryKey: ["schedule-doctor-map"],
		queryFn: () =>
			getAllDoctorsIncludingInactive({ pageSize: MATRIX_PAGE_SIZE }),
	});
	const doctorNames = useMemo(
		() =>
			new Map(
				(doctorsQuery.data ?? []).map((doctor) => [doctor.id, doctor.name]),
			),
		[doctorsQuery.data],
	);
	const subdepartmentNames = useMemo(
		() => new Map(subdepartments.map((item) => [item.id, item.name])),
		[subdepartments],
	);

	// 当前周的周一 / 周日（来自生效筛选条件中的日期）。
	const monday = mondayOfWeek(appliedFilter.date);
	const days = useMemo(() => weekDates(monday), [monday]);
	const sunday = days[days.length - 1] ?? monday;

	// GET /api/v1/schedule/plans（规范 5.1）：按日期闭区间查询一周计划，includeSlots=false。
	const plansQuery = useQuery({
		queryKey: [
			"schedule-plans",
			appliedFilter.departmentId ?? "all",
			monday,
			sunday,
		],
		queryFn: () =>
			getSchedulePlans({
				departmentId: appliedFilter.departmentId,
				fromDate: monday,
				toDate: sunday,
				includeSlots: false,
				page: 1,
				pageSize: MATRIX_PAGE_SIZE,
				sort: "date",
				order: "asc",
			}),
	});
	const plans = plansQuery.data?.items ?? [];
	const total = plansQuery.data?.total ?? 0;

	// 医生姓名过滤：规范 5.1 没有姓名参数，因此在前端按「姓名包含关键字」（不区分大小写）过滤，
	// 只保留匹配到的计划，不向服务端传 doctorId（一次请求只能匹配单个医生，无法实现模糊查询）。
	const filteredPlans = useMemo(() => {
		const keyword = appliedFilter.doctorName.trim().toLowerCase();
		if (!keyword) return plans;
		return plans.filter((plan) =>
			(doctorNames.get(plan.doctorId) ?? "").toLowerCase().includes(keyword),
		);
	}, [plans, appliedFilter.doctorName, doctorNames]);

	// 矩阵行：当周出现过的诊室（子科室），按 id 升序，行号即「序号」列。
	const rooms = useMemo(() => {
		const ids = new Set(filteredPlans.map((plan) => plan.subdepartmentId));
		return [...ids].sort((left, right) => left - right);
	}, [filteredPlans]);

	// 单元格聚合：诊室 + 日期 -> 该组合下的计划（按 doctorId 升序，保证姓名顺序稳定）。
	const cellPlans = useMemo(() => {
		const map = new Map<string, WorkPlan[]>();
		for (const plan of filteredPlans) {
			const key = cellKey(plan.subdepartmentId, plan.date);
			const list = map.get(key);
			if (list) list.push(plan);
			else map.set(key, [plan]);
		}
		for (const list of map.values()) {
			list.sort((left, right) => left.doctorId - right.doctorId);
		}
		return map;
	}, [filteredPlans]);

	// 名称映射兜底：接口未返回对应记录时显示「医生 #id」「子科室 #id」，避免出现空白单元格。
	const doctorLabel = (doctorId: number) =>
		doctorNames.get(doctorId) ?? `医生 #${doctorId}`;
	const roomLabel = (subdepartmentId: number) =>
		subdepartmentNames.get(subdepartmentId) ?? `子科室 #${subdepartmentId}`;

	// 空态文案：区分「本周确实没有出诊计划」与「医生姓名过滤后无匹配」，避免用户误判为数据缺失。
	const emptyMatrixMessage = appliedFilter.doctorName.trim()
		? "没有匹配该医生姓名的出诊计划，请调整姓名后重试"
		: "本周暂无出诊计划";

	// 明细弹窗当前展示的计划：始终从最新的矩阵数据派生，写操作失效缓存后会自动更新。
	const detailPlans = detailCell
		? (cellPlans.get(cellKey(detailCell.subdepartmentId, detailCell.date)) ??
			[])
		: [];

	// 点击「查询」：把草稿条件提交为生效条件（周区间随之变化并触发请求）。
	const handleSearch = () => {
		setAppliedFilter({ ...draftFilter });
	};

	// 周切换（上一周 / 下一周）：直接更新生效日期，等价于按新的一周重新查询。
	const shiftWeek = (offsetDays: number) => {
		const nextDate = shiftDateYMD(appliedFilter.date, offsetDays);
		setAppliedFilter((prev) => ({ ...prev, date: nextDate }));
		setDraftFilter((prev) => ({ ...prev, date: nextDate }));
	};

	// 「本周」：回到今天所在自然周。
	const goToCurrentWeek = () => {
		const today = todayYMD();
		setAppliedFilter((prev) => ({ ...prev, date: today }));
		setDraftFilter((prev) => ({ ...prev, date: today }));
	};

	// 写操作（新增/改容量/删除计划、时段增删改）成功后统一失效计划缓存，矩阵与明细随之刷新（规范 1.4）。
	const invalidatePlans = () => {
		void queryClient.invalidateQueries({ queryKey: ["schedule-plans"] });
	};

	return (
		<main className="min-h-screen bg-[#f5f7fb]">
			<div className="mx-auto flex max-w-[1600px] flex-col gap-4">
				{/* 筛选栏：科室 / 日期 / 医生姓名 / 查询 / 新增 */}
				<section className="flex flex-wrap items-end justify-between gap-3 border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex flex-wrap items-end gap-3">
						<FilterField label="科室">
							<FilterSelect
								value={draftFilter.departmentId?.toString() ?? ""}
								onChange={(value) =>
									setDraftFilter((prev) => ({
										...prev,
										departmentId: value ? Number(value) : undefined,
									}))
								}
								options={[
									{ value: "", label: "选择科室" },
									...departments.map((department) => ({
										value: String(department.id),
										label: department.name,
									})),
								]}
							/>
						</FilterField>
						<FilterField label="日期">
							{/* 日期使用原生 date 输入；接口日期字段统一为 YYYY-MM-DD（规范 1.1）。
							    宽度由外层 div 约束：inputClassName 自带 w-full，同类工具类谁生效取决于
							    样式表中的顺序，直接在 className 里追加 w-44 并不可靠。 */}
							<div className="w-44">
								<input
									type="date"
									className={inputClassName}
									value={draftFilter.date}
									onChange={(event) =>
										setDraftFilter((prev) => ({
											...prev,
											date: event.target.value || todayYMD(),
										}))
									}
								/>
							</div>
						</FilterField>
						<FilterField label="医生姓名">
							<div className="w-40">
								<TextInput
									value={draftFilter.doctorName}
									placeholder="医生姓名"
									onChange={(event) =>
										setDraftFilter((prev) => ({
											...prev,
											doctorName: event.target.value,
										}))
									}
								/>
							</div>
						</FilterField>
						<Button
							variant="primary"
							className="h-10 px-5"
							onClick={handleSearch}
						>
							<Search className="h-4 w-4" />
							查询
						</Button>
					</div>
					<Button
						variant="primary"
						className="h-10 px-5"
						onClick={() => setCreateOpen(true)}
					>
						<Plus className="h-4 w-4" />
						新增
					</Button>
				</section>

				{/* 周矩阵：行 = 诊室，列 = 周一 ~ 周日，单元格 = 当天出诊医生姓名 */}
				<section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
						<div className="flex items-baseline gap-3">
							<span className="text-sm font-medium text-slate-700">
								门诊日程表
							</span>
							<span className="text-xs text-slate-400">
								{formatWeekRange(monday)}
							</span>
						</div>
						<div className="flex items-center gap-1">
							<Button
								onClick={() => shiftWeek(-DAY_COUNT)}
								aria-label="上一周"
								title="上一周"
							>
								<ChevronLeft className="h-4 w-4" />
								上一周
							</Button>
							<Button onClick={goToCurrentWeek} title="回到今天所在周">
								本周
							</Button>
							<Button
								onClick={() => shiftWeek(DAY_COUNT)}
								aria-label="下一周"
								title="下一周"
							>
								下一周
								<ChevronRight className="h-4 w-4" />
							</Button>
						</div>
					</div>
					{/* 规范 1.1：pageSize 上限 100；超出时说明只展示了前 100 条，避免用户误以为数据缺失。 */}
					{total > MATRIX_PAGE_SIZE ? (
						<div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
							结果超过 {MATRIX_PAGE_SIZE} 条，仅展示前 {MATRIX_PAGE_SIZE}{" "}
							条，请选择科室或缩小范围。
						</div>
					) : null}
					<div className="overflow-x-auto">
						<table className="w-full min-w-[1320px] table-fixed border-collapse text-sm">
							<colgroup>
								<col className="w-[72px]" />
								<col className="w-[200px]" />
								{days.map((day) => (
									<col key={day} />
								))}
							</colgroup>
							<thead className="bg-slate-100/60 text-xs font-semibold text-slate-600">
								<tr>
									<th className="px-3 py-3 text-center">序号</th>
									<th className="px-3 py-3 text-center">诊室名称</th>
									{days.map((day) => (
										<th
											key={day}
											className="border-l border-slate-200 px-3 py-3 text-center"
										>
											{formatDayHeader(day)}
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{plansQuery.isLoading ? (
									<TableMessage colSpan={DAY_COUNT + 2}>
										正在加载出诊计划...
									</TableMessage>
								) : null}
								{plansQuery.isError ? (
									<TableMessage colSpan={DAY_COUNT + 2}>
										{getApiErrorMessage(plansQuery.error)}
									</TableMessage>
								) : null}
								{!plansQuery.isLoading &&
								!plansQuery.isError &&
								rooms.length === 0 ? (
									<TableMessage colSpan={DAY_COUNT + 2}>
										{emptyMatrixMessage}
									</TableMessage>
								) : null}
								{rooms.map((subdepartmentId, index) => (
									<tr
										key={subdepartmentId}
										className="transition hover:bg-blue-50/40"
									>
										<td className="px-3 py-3 text-center text-slate-500">
											{index + 1}
										</td>
										<td className="px-3 py-3 font-medium text-slate-800">
											{roomLabel(subdepartmentId)}
										</td>
										{days.map((day) => {
											const items =
												cellPlans.get(cellKey(subdepartmentId, day)) ?? [];
											return (
												<td
													key={day}
													className="border-l border-slate-100 px-3 py-3 align-middle"
												>
													{items.length === 0 ? (
														// 当天无计划：灰色占位，不可点击。
														<span className="text-slate-300">-</span>
													) : (
														// 有计划的单元格可点击，打开该诊室当天的「出诊明细」弹窗。
														<button
															type="button"
															onClick={() =>
																setDetailCell({ subdepartmentId, date: day })
															}
															className="cursor-pointer text-left text-slate-700 transition hover:text-blue-600 hover:underline"
														>
															{items
																.map((plan) => doctorLabel(plan.doctorId))
																.join("、")}
														</button>
													)}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			</div>

			{/* 「新增」弹窗：每次打开都是新挂载的组件实例，「确定」提交与重试复用同一个幂等键。 */}
			{createOpen ? (
				<CreatePlanModal
					departments={departments}
					subdepartments={subdepartments}
					defaultDate={defaultPlanDate(monday)}
					onClose={() => setCreateOpen(false)}
					onCreated={invalidatePlans}
				/>
			) : null}

			{/* 「出诊明细」弹窗：以单元格为 key，切换单元格时内部展开状态自动重置。 */}
			{detailCell ? (
				<VisitingDetailModal
					key={cellKey(detailCell.subdepartmentId, detailCell.date)}
					roomName={roomLabel(detailCell.subdepartmentId)}
					date={detailCell.date}
					plans={detailPlans}
					doctorLabel={doctorLabel}
					onClose={() => setDetailCell(null)}
					onChanged={invalidatePlans}
				/>
			) : null}
		</main>
	);
}

// 「出诊明细」弹窗：展示某诊室某天的全部出诊计划，并支持改容量 / 删除计划 / 展开该计划的时段管理。
function VisitingDetailModal({
	roomName,
	date,
	plans,
	doctorLabel,
	onClose,
	onChanged,
}: {
	roomName: string;
	date: string;
	plans: WorkPlan[];
	doctorLabel: (doctorId: number) => string;
	onClose: () => void;
	onChanged: () => void;
}) {
	// 当前展开时段的计划 id（同一时间只展开一个，保持弹窗紧凑）。
	const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null);
	// 正在「改容量」的计划，非空时渲染容量弹窗。
	const [editingPlan, setEditingPlan] = useState<WorkPlan | null>(null);
	// 待二次确认删除的计划。
	const [pendingDeletePlan, setPendingDeletePlan] = useState<WorkPlan | null>(
		null,
	);
	const [deleting, setDeleting] = useState(false);

	// 删除计划（规范 5.4 DELETE /schedule/plans/{planId}，成功 204 无响应体）。
	const handleDeletePlan = async () => {
		if (!pendingDeletePlan || deleting) return;
		setDeleting(true);
		try {
			await deleteSchedulePlan(pendingDeletePlan.id);
			showMessage("right", "删除成功");
			// 删除的是该诊室当天最后一条计划时，明细已无内容可展示，直接关闭弹窗。
			const isLastPlan = plans.length <= 1;
			setPendingDeletePlan(null);
			onChanged();
			if (isLastPlan) onClose();
		} catch (error) {
			// 资源已不存在（已被他人删除）时按「已删除」处理：刷新列表，而不是把 404 当失败提示。
			if (isApiError(error) && error.code === "SCHEDULE_PLAN_NOT_FOUND") {
				showMessage("warn", "该出诊计划已不存在，已刷新列表");
				onChanged();
			} else {
				showMessage("wrong", describePlanDeleteError(error));
			}
			setPendingDeletePlan(null);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<>
			<Modal
				open
				title={`${roomName} · ${formatDayHeader(date)}`}
				widthClassName="max-w-3xl"
				onClose={onClose}
				footer={<Button onClick={onClose}>关闭</Button>}
			>
				<div className="flex flex-col gap-3">
					{plans.length === 0 ? (
						<p className="py-6 text-center text-sm text-slate-400">
							该诊室当日暂无出诊计划
						</p>
					) : null}
					{plans.map((plan) => {
						const expanded = expandedPlanId === plan.id;
						return (
							<div
								key={plan.id}
								className="rounded-md border border-slate-200 bg-white"
							>
								<div className="flex flex-wrap items-center justify-between gap-2 p-3">
									<div className="flex flex-wrap items-baseline gap-3">
										<span className="text-sm font-medium text-slate-800">
											{doctorLabel(plan.doctorId)}
										</span>
										<span className="text-xs text-slate-500">
											最大号源 {plan.maximum} · 已用 {plan.used} · 剩余{" "}
											{plan.remaining}
										</span>
									</div>
									<div className="flex items-center gap-2">
										<Button onClick={() => setEditingPlan(plan)}>改容量</Button>
										<Button
											variant="danger"
											onClick={() => setPendingDeletePlan(plan)}
										>
											删除计划
										</Button>
										<Button
											onClick={() =>
												setExpandedPlanId(expanded ? null : plan.id)
											}
										>
											{expanded ? "收起时段" : "时段"}
										</Button>
									</div>
								</div>
								{/* 时段面板：expanded=false 时其内部查询不发起（规范 5.5 GET 时段列表）。 */}
								<SlotsPanel
									plan={plan}
									expanded={expanded}
									onPlansChanged={onChanged}
								/>
							</div>
						);
					})}
				</div>
			</Modal>

			{/* 修改计划容量弹窗（规范 5.3） */}
			{editingPlan ? (
				<EditPlanMaximumModal
					plan={editingPlan}
					onClose={() => setEditingPlan(null)}
					onUpdated={onChanged}
				/>
			) : null}

			{/* 删除计划二次确认 */}
			<ConfirmDialog
				open={pendingDeletePlan !== null}
				title="删除出诊计划"
				danger
				confirmText="删除"
				loading={deleting}
				message={
					pendingDeletePlan
						? `确定删除 ${formatDayHeader(pendingDeletePlan.date)} ${doctorLabel(pendingDeletePlan.doctorId)} 的出诊计划吗？删除后不可恢复。`
						: ""
				}
				onConfirm={() => void handleDeletePlan()}
				onCancel={() => {
					if (!deleting) setPendingDeletePlan(null);
				}}
			/>
		</>
	);
}

// 「新增」弹窗：一次提交可同时创建出诊计划与若干出诊时段。
// 契约：规范 5.2 POST /schedule/plans（必须携带 Idempotency-Key）
// 与规范 5.5 POST /schedule/plans/{planId}/slots（每个时段一次写操作）。
// 说明：原型表单只列出「科室部门」，但规范 5.2 的请求体必须包含 subdepartmentId（诊室），
// 因此这里补充「出诊诊室」下拉；医生只关联一个子科室时自动选中它，减少一次选择。
function CreatePlanModal({
	departments,
	subdepartments,
	defaultDate,
	onClose,
	onCreated,
}: {
	departments: DepartmentOption[];
	subdepartments: SubdepartmentOption[];
	defaultDate: string;
	onClose: () => void;
	onCreated: () => void;
}) {
	const queryClient = useQueryClient();
	const [departmentId, setDepartmentId] = useState("");
	const [doctorId, setDoctorId] = useState("");
	const [subdepartmentId, setSubdepartmentId] = useState("");
	const [date, setDate] = useState(defaultDate);
	// 已勾选的出诊时段（保存时段文案，提交时再换算成 slot 编号）。
	const [checkedSlots, setCheckedSlots] = useState<string[]>([]);
	// 时段人数：滑块与步进器共用同一个 state，双向同步。
	const [capacity, setCapacity] = useState(SLOT_CAPACITY_DEFAULT);
	const [formError, setFormError] = useState("");
	const [submitting, setSubmitting] = useState(false);

	// GET /api/v1/catalog/doctors：新增出诊计划的医生下拉，按「科室部门」过滤（原型：先选科室再选医生）。
	// 未选择科室时不发起请求，避免展示与所选科室无关的医生。
	// 只提供在职（ACTIVE，数据库 status=1）医生：非在职医生不能新增出诊计划；
	// 并分页取全量，避免科室医生超过单页上限时选不到目标医生。
	const doctorsQuery = useQuery({
		queryKey: ["schedule-form-doctors", departmentId],
		queryFn: () =>
			getAllDoctors({
				departmentId: Number(departmentId),
				status: "ACTIVE",
				pageSize: MATRIX_PAGE_SIZE,
			}),
		enabled: Number(departmentId) > 0,
	});
	const doctors = doctorsQuery.data ?? [];
	// 规范 1.5：计划创建的幂等键在弹窗打开（组件挂载）时生成一次并存入 ref，
	// 之后无论双击还是失败重试都复用同一个 key，保证不会重复创建计划。
	const planKeyRef = useRef("");
	useEffect(() => {
		planKeyRef.current = createIdempotencyKey("plan-create");
	}, []);

	// GET /api/v1/catalog/doctors/{doctorId}：详情里的 subdepartments 用于判断医生是否只关联一个诊室。
	const doctorDetailQuery = useQuery({
		// 缓存键用数字 id，与医生详情页（nursing/doctor/$doctorId）保持一致，避免同一医生缓存两份。
		queryKey: ["doctor-detail", Number(doctorId)],
		queryFn: () => getDoctorDetail(Number(doctorId)),
		enabled: Number(doctorId) > 0,
	});
	// 医生只关联一个子科室时自动选中（原型没有该交互，这里减少一次选择）。
	useEffect(() => {
		const linked = doctorDetailQuery.data?.subdepartments ?? [];
		if (linked.length === 1) {
			setSubdepartmentId(String(linked[0].id));
		}
	}, [doctorDetailQuery.data]);

	// 诊室下拉：按所选科室过滤；未选科室时展示全部子科室。
	const roomOptions = subdepartments.filter(
		(item) => !departmentId || item.departmentId === Number(departmentId),
	);
	const allSlotsChecked = checkedSlots.length === OUTPATIENT_TIME_SLOTS.length;

	// 「全选」复选框与放大镜按钮共用：全选 / 清空。
	const toggleAllSlots = () => {
		setCheckedSlots(allSlotsChecked ? [] : [...OUTPATIENT_TIME_SLOTS]);
	};

	// 单个时段勾选切换。
	const toggleSlot = (label: string) => {
		setCheckedSlots((prev) =>
			prev.includes(label)
				? prev.filter((item) => item !== label)
				: [...prev, label],
		);
	};

	// 提交：先创建计划，再逐个创建勾选的时段。
	const handleSubmit = async () => {
		if (submitting) return;

		if (!departmentId) {
			setFormError("请选择科室部门");
			return;
		}
		if (!doctorId) {
			setFormError("请选择出诊医生");
			return;
		}
		// 兜底校验：只有在职（status=ACTIVE，数据库 1）医生才能新增出诊计划。
		// 下拉已只提供在职医生，这里再校验一次，避免下拉数据过期或选择结果被外部改写。
		if (!doctors.some((doctor) => String(doctor.id) === doctorId)) {
			setFormError("该医生不在职，不能新增出诊计划");
			return;
		}
		if (!subdepartmentId) {
			setFormError("请选择出诊诊室");
			return;
		}
		if (!date) {
			setFormError("请选择出诊日期");
			return;
		}
		// 规范 5.2：排班写入只允许未来日期，日期不得早于业务当前日期。
		if (date < todayYMD()) {
			setFormError("出诊日期不得早于今天");
			return;
		}
		if (
			!Number.isInteger(capacity) ||
			capacity < SLOT_CAPACITY_MIN ||
			capacity > SLOT_CAPACITY_MAX
		) {
			setFormError(
				`时段人数必须是 ${SLOT_CAPACITY_MIN}-${SLOT_CAPACITY_MAX} 之间的整数`,
			);
			return;
		}

		// slot 编号映射：原型顺序的下标 + 1（规范 2.2：slot 是整数时段标识，没有时间语义）。
		const selectedSlots = OUTPATIENT_TIME_SLOTS.map((label, index) => ({
			label,
			slot: index + 1,
		}))
			.filter((item) => checkedSlots.includes(item.label))
			.sort((left, right) => left.slot - right.slot);

		// 计划总号源 = 时段人数 × 已勾选时段数；未勾选时段时只创建计划，maximum 取时段人数。
		const maximum = capacity * Math.max(1, selectedSlots.length);

		setFormError("");
		setSubmitting(true);
		try {
			// 规范 5.2 POST /schedule/plans：创建未来出诊计划，需要 Idempotency-Key。
			const plan = await createSchedulePlan(
				{
					doctorId: Number(doctorId),
					subdepartmentId: Number(subdepartmentId),
					date,
					maximum,
				},
				planKeyRef.current,
			);

			// 规范 5.5 POST /schedule/plans/{planId}/slots：逐个创建时段，单个时段容量 = 时段人数。
			// 时段幂等键用稳定的 `${计划幂等键}-slot-${slot}`，重复提交不会重复建时段（规范 1.5）。
			const failedSlots: string[] = [];
			for (const item of selectedSlots) {
				try {
					await createSchedulePlanSlot(
						plan.id,
						{ slot: item.slot, maximum: capacity },
						`${planKeyRef.current}-slot-${item.slot}`,
					);
				} catch (error) {
					failedSlots.push(`${item.label}（${getApiErrorMessage(error)}）`);
				}
			}

			// 失效计划与时段缓存（新计划即使没有时段也要刷新矩阵）。
			void queryClient.invalidateQueries({ queryKey: ["schedule-plans"] });
			void queryClient.invalidateQueries({
				queryKey: ["schedule-slots", plan.id],
			});
			onCreated();
			onClose();
			// 计划已创建但部分时段失败时，用警告提示说明「部分成功」，避免用户误以为整单失败。
			if (failedSlots.length > 0) {
				showMessage(
					"warn",
					`出诊计划已创建，但部分时段创建失败：${failedSlots.join("；")}`,
				);
			} else {
				showMessage("right", "新增成功");
			}
		} catch (error) {
			if (isApiError(error) && error.code === "SCHEDULE_PLAN_EXISTS") {
				// 规范 5.2：同一医生/子科室/日期重复计划返回 409 SCHEDULE_PLAN_EXISTS。
				setFormError("该医生在该诊室当日已有出诊计划");
			} else {
				// 其余情况（含 422 校验失败的 message）统一取接口文案。
				setFormError(getApiErrorMessage(error));
			}
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Modal
			open
			title="新增"
			onClose={submitting ? () => {} : onClose}
			footer={
				<>
					<Button onClick={onClose} disabled={submitting}>
						取消
					</Button>
					<Button
						variant="primary"
						onClick={() => void handleSubmit()}
						disabled={submitting}
					>
						{submitting ? "处理中..." : "确定"}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<Field label="科室部门" required>
					<SelectInput
						value={departmentId}
						disabled={submitting}
						onChange={(event) => {
							setDepartmentId(event.target.value);
							// 切换科室后医生候选与诊室候选都会变化，需要重新选择。
							setDoctorId("");
							setSubdepartmentId("");
						}}
					>
						<option value="">请选择</option>
						{departments.map((department) => (
							<option key={department.id} value={String(department.id)}>
								{department.name}
							</option>
						))}
					</SelectInput>
				</Field>

				<Field label="出诊医生" required>
					<SelectInput
						value={doctorId}
						disabled={submitting || !departmentId}
						onChange={(event) => {
							setDoctorId(event.target.value);
							setSubdepartmentId("");
						}}
					>
						<option value="">请选择</option>
						{doctors.map((doctor) => (
							<option key={doctor.id} value={String(doctor.id)}>
								{doctor.name}
							</option>
						))}
					</SelectInput>
				</Field>

				{/* 契约要求：规范 5.2 请求体必须包含 subdepartmentId，原型表单未列出，这里补充为「出诊诊室」。 */}
				<Field label="出诊诊室" required hint="对应接口的 subdepartmentId">
					<SelectInput
						value={subdepartmentId}
						disabled={submitting}
						onChange={(event) => setSubdepartmentId(event.target.value)}
					>
						<option value="">请选择</option>
						{roomOptions.map((item) => (
							<option key={item.id} value={String(item.id)}>
								{item.name}
							</option>
						))}
					</SelectInput>
				</Field>

				<Field label="出诊日期" required>
					{/* 只允许未来日期，因此 min 设为今天（规范 5.2）。 */}
					<input
						type="date"
						className={inputClassName}
						value={date}
						min={todayYMD()}
						disabled={submitting}
						onChange={(event) => setDate(event.target.value)}
					/>
				</Field>

				{/* 出诊时间：3 列半小时候选时段；「全选」复选框与放大镜按钮都用于全选/清空。 */}
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between">
						<span className="text-xs font-medium text-slate-500">出诊时间</span>
						<div className="flex items-center gap-2">
							<label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
								<input
									type="checkbox"
									className="h-4 w-4 rounded border-slate-300 accent-blue-600"
									checked={allSlotsChecked}
									disabled={submitting}
									onChange={toggleAllSlots}
								/>
								全选
							</label>
							{/* 放大镜按钮：实现为「全选 / 清空」的图标入口，title 给出提示。 */}
							<button
								type="button"
								title="全选 / 清空时段"
								aria-label="全选或清空时段"
								disabled={submitting}
								onClick={toggleAllSlots}
								className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<ZoomIn className="h-4 w-4" />
							</button>
						</div>
					</div>
					<div className="grid grid-cols-3 gap-2">
						{OUTPATIENT_TIME_SLOTS.map((label) => (
							<label
								key={label}
								className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-600"
							>
								<input
									type="checkbox"
									className="h-4 w-4 rounded border-slate-300 accent-blue-600"
									checked={checkedSlots.includes(label)}
									disabled={submitting}
									onChange={() => toggleSlot(label)}
								/>
								{label}
							</label>
						))}
					</div>
				</div>

				{/* 时段人数：滑块与步进器双向同步同一个 state。 */}
				<Field
					label="时段人数"
					hint={`${SLOT_CAPACITY_MIN}-${SLOT_CAPACITY_MAX} 人，滑块与步进器同步`}
				>
					<div className="flex items-center gap-3">
						<input
							type="range"
							min={SLOT_CAPACITY_MIN}
							max={SLOT_CAPACITY_MAX}
							step={1}
							value={capacity}
							disabled={submitting}
							onChange={(event) =>
								setCapacity(clampCapacity(Number(event.target.value)))
							}
							className="h-1.5 w-full cursor-pointer rounded-full bg-slate-200 accent-blue-600"
						/>
						<div className="flex shrink-0 items-center gap-1">
							<Button
								aria-label="减少时段人数"
								title="减少"
								disabled={submitting || capacity <= SLOT_CAPACITY_MIN}
								onClick={() => setCapacity((prev) => clampCapacity(prev - 1))}
							>
								-
							</Button>
							{/* 宽度由外层 div 约束，理由同筛选栏的日期输入框（inputClassName 自带 w-full）。 */}
							<div className="w-16">
								<NumberInput
									className="text-center"
									min={SLOT_CAPACITY_MIN}
									max={SLOT_CAPACITY_MAX}
									step={1}
									value={capacity}
									disabled={submitting}
									onChange={(event) =>
										setCapacity(clampCapacity(Number(event.target.value)))
									}
								/>
							</div>
							<Button
								aria-label="增加时段人数"
								title="增加"
								disabled={submitting || capacity >= SLOT_CAPACITY_MAX}
								onClick={() => setCapacity((prev) => clampCapacity(prev + 1))}
							>
								+
							</Button>
						</div>
					</div>
				</Field>

				{formError ? <FormError>{formError}</FormError> : null}
			</div>
		</Modal>
	);
}

// 修改计划容量弹窗：仅允许修改 maximum，且不得小于已用号源（规范 5.3 PATCH /schedule/plans/{planId}）。
function EditPlanMaximumModal({
	plan,
	onClose,
	onUpdated,
}: {
	plan: WorkPlan;
	onClose: () => void;
	onUpdated: () => void;
}) {
	const queryClient = useQueryClient();
	const [maximum, setMaximum] = useState(String(plan.maximum));
	const [formError, setFormError] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async () => {
		if (submitting) return;

		const parsedMaximum = Number(maximum);
		if (!maximum || !Number.isInteger(parsedMaximum)) {
			setFormError("请输入最大号源");
			return;
		}
		// 规范 5.3：新容量不得小于当前已用号源。
		if (parsedMaximum < plan.used) {
			setFormError(`最大号源不能小于已用号源 ${plan.used}`);
			return;
		}
		if (parsedMaximum > CAPACITY_MAX) {
			setFormError(`最大号源不能超过 ${CAPACITY_MAX}`);
			return;
		}

		setFormError("");
		setSubmitting(true);
		try {
			// 规范 5.3 PATCH /schedule/plans/{planId}，仅允许修改 maximum。
			// 项目约定不做 If-Match：不发送 If-Match 头，只带幂等键。
			await updateSchedulePlanMaximum({
				planId: plan.id,
				maximum: parsedMaximum,
			});
			showMessage("right", "修改成功");
			void queryClient.invalidateQueries({ queryKey: ["schedule-plans"] });
			onUpdated();
			onClose();
		} catch (error) {
			if (isApiError(error) && error.code === "SCHEDULE_CAPACITY_INVALID") {
				setFormError("最大号源不能小于已用号源");
			} else if (isApiError(error) && error.code === "SCHEDULE_PLAN_LOCKED") {
				setFormError("计划已开始，不能修改");
			} else if (isApiError(error) && error.code === "SCHEDULE_CONFLICT") {
				// 规范 5.3 的并发冲突：后端把「容量小于已用」也归入该码，
				// 因此优先采用服务端返回的准确文案，再刷新列表让用户基于最新数据重试。
				setFormError(getApiErrorMessage(error));
				void queryClient.invalidateQueries({ queryKey: ["schedule-plans"] });
			} else {
				setFormError(getApiErrorMessage(error));
			}
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Modal
			open
			title="修改最大号源"
			widthClassName="max-w-md"
			onClose={submitting ? () => {} : onClose}
			footer={
				<>
					<Button onClick={onClose} disabled={submitting}>
						取消
					</Button>
					<Button
						variant="primary"
						onClick={() => void handleSubmit()}
						disabled={submitting}
					>
						{submitting ? "处理中..." : "确定"}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-3">
				{/* 只读上下文：WorkPlan 只带 doctorId/subdepartmentId，这里展示日期与用量帮助确认改的是哪条计划。 */}
				<div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
					{plan.date} · 已用 {plan.used} / 当前上限 {plan.maximum}
				</div>
				<Field label="最大号源" required hint={`不能小于已用号源 ${plan.used}`}>
					<NumberInput
						value={maximum}
						min={Math.max(1, plan.used)}
						max={CAPACITY_MAX}
						step={1}
						disabled={submitting}
						onChange={(event) => setMaximum(event.target.value)}
					/>
				</Field>
				{formError ? <FormError>{formError}</FormError> : null}
			</div>
		</Modal>
	);
}

// 出诊时间段管理面板：展开计划时展示时段列表，并提供新增 / 改容量 / 删除。
// 契约来源：规范 5.5（时段接口）与 12.3；写操作需要幂等键（规范 1.5），项目约定不做 If-Match。
function SlotsPanel({
	plan,
	expanded,
	onPlansChanged,
}: {
	plan: WorkPlan;
	expanded: boolean;
	onPlansChanged: () => void;
}) {
	const queryClient = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [createSlotText, setCreateSlotText] = useState("");
	const [createMaximumText, setCreateMaximumText] = useState("");
	const [createError, setCreateError] = useState("");
	// 规范 1.5：时段创建同样需要幂等键，弹窗打开时生成一次并存入 ref，重试复用同一个 key。
	const createKeyRef = useRef("");
	const [capacitySlotId, setCapacitySlotId] = useState<number | null>(null);
	const [capacityMaximumText, setCapacityMaximumText] = useState("");
	const [capacityError, setCapacityError] = useState("");
	const [deleteSlotId, setDeleteSlotId] = useState<number | null>(null);

	// 规范 5.5 GET /schedule/plans/{planId}/slots：返回时段数组本身（不是分页结构）。
	// enabled=false（折叠状态）不发起请求，避免为未展开的计划产生无谓流量。
	const slotsQuery = useQuery({
		queryKey: ["schedule-slots", plan.id],
		queryFn: () => getSchedulePlanSlots(plan.id),
		enabled: expanded,
	});
	// 兜底顺序：接口数据 -> 计划内联 slots -> 空数组（后端可能省略空数组）。
	const slots: ScheduleSlot[] = slotsQuery.data ?? plan.slots ?? [];
	// 弹窗读取当前列表中的最新快照，保证 used 已随缓存失效重取更新。
	const capacitySlot = slots.find((item) => item.id === capacitySlotId) ?? null;
	const deleteSlot = slots.find((item) => item.id === deleteSlotId) ?? null;

	// 写操作成功后统一失效时段缓存，并通知父级刷新计划列表（计划的 used/remaining 是时段汇总）。
	const refreshAfterMutation = async () => {
		await queryClient.invalidateQueries({
			queryKey: ["schedule-slots", plan.id],
		});
		onPlansChanged();
	};

	// 规范 5.5 POST /schedule/plans/{planId}/slots（需要幂等键）。
	const createMutation = useMutation({
		mutationFn: (body: CreateSlotRequest) =>
			createSchedulePlanSlot(plan.id, body, createKeyRef.current),
		onSuccess: async () => {
			showMessage("right", "新增成功");
			setCreateOpen(false);
			await refreshAfterMutation();
		},
		onError: (error) => {
			setCreateError(describeSlotCreateError(error));
		},
	});

	// 规范 5.5 PATCH /schedule/slots/{slotId}（仅允许修改 maximum）。
	const updateMutation = useMutation({
		mutationFn: (variables: { slotId: number; maximum: number }) =>
			updateScheduleSlotMaximum(variables),
		onSuccess: async () => {
			showMessage("right", "修改成功");
			setCapacitySlotId(null);
			await refreshAfterMutation();
		},
		onError: (error) => {
			setCapacityError(describeSlotUpdateError(error));
			// 409 SCHEDULE_CONFLICT：服务端并发冲突或容量小于已用；
			// 两种情况都重新拉取时段列表，并保持弹窗打开供用户基于最新数据重试。
			if (isApiError(error) && error.code === "SCHEDULE_CONFLICT") {
				void queryClient.invalidateQueries({
					queryKey: ["schedule-slots", plan.id],
				});
			}
		},
	});

	// 规范 5.5 DELETE /schedule/slots/{slotId}（成功 204）。
	const deleteMutation = useMutation({
		mutationFn: (slotId: number) => deleteScheduleSlot(slotId),
		onSuccess: async () => {
			showMessage("right", "删除成功");
			setDeleteSlotId(null);
			await refreshAfterMutation();
		},
		onError: (error) => {
			// 确认框内没有错误展示位，删除失败用顶部提示，并关闭确认框避免误导。
			if (isApiError(error) && error.code === "SCHEDULE_SLOT_NOT_FOUND") {
				// 时段已被他人删除：按「已删除」处理并刷新，避免把 404 当成失败提示。
				showMessage("warn", "该时段已不存在，已刷新列表");
				void refreshAfterMutation();
			} else {
				showMessage("wrong", describeSlotDeleteError(error));
			}
			setDeleteSlotId(null);
		},
	});

	// 打开新增时段弹窗：生成新的幂等键（规范 1.5），并清空上一次的输入与错误。
	const openCreateModal = () => {
		createKeyRef.current = createIdempotencyKey("slot-create");
		setCreateSlotText("");
		setCreateMaximumText("");
		setCreateError("");
		setCreateOpen(true);
	};

	// 提交新增时段：先做必填与范围校验，再调用接口；提交期间按钮禁用，避免重复提交。
	const handleCreateSubmit = () => {
		if (createMutation.isPending) return;
		const slot = parseSlotInteger(createSlotText);
		const maximum = parseSlotInteger(createMaximumText);
		if (slot === null || slot < 1 || slot > CAPACITY_MAX) {
			setCreateError(`时段编号必须为 1-${CAPACITY_MAX} 之间的整数`);
			return;
		}
		if (maximum === null || maximum < 1 || maximum > CAPACITY_MAX) {
			setCreateError(`最大号源必须为 1-${CAPACITY_MAX} 之间的整数`);
			return;
		}
		// 规范 5.5：同一计划下 slot 不可重复；先本地拦截必然失败的请求，服务端仍会返回 409。
		if (slots.some((item) => item.slot === slot)) {
			setCreateError("该时段已存在");
			return;
		}
		setCreateError("");
		createMutation.mutate({ slot, maximum });
	};

	// 打开改容量弹窗：默认填入当前容量。
	const openCapacityModal = (slot: ScheduleSlot) => {
		setCapacitySlotId(slot.id);
		setCapacityMaximumText(String(slot.maximum));
		setCapacityError("");
	};

	// 提交改容量：新容量不得小于已用号源（规范 5.5 SCHEDULE_CAPACITY_INVALID 的约束）。
	const handleCapacitySubmit = () => {
		if (updateMutation.isPending || capacitySlot === null) return;
		const used = capacitySlot.used ?? 0;
		const maximum = parseSlotInteger(capacityMaximumText);
		if (maximum === null || maximum < 1 || maximum > CAPACITY_MAX) {
			setCapacityError(`最大号源必须为 1-${CAPACITY_MAX} 之间的整数`);
			return;
		}
		if (maximum < used) {
			setCapacityError("最大号源不能小于已用号源");
			return;
		}
		setCapacityError("");
		// 项目约定不做 If-Match：只提交 slotId 与 maximum。
		updateMutation.mutate({
			slotId: capacitySlot.id,
			maximum,
		});
	};

	// 折叠状态不渲染子表格（此时查询同样未启用）。
	if (!expanded) return null;

	return (
		<div className="border-t border-slate-200 bg-slate-50/60 p-4">
			<div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
					<div className="flex items-baseline gap-2">
						<span className="text-sm font-semibold text-slate-700">
							出诊时间段
						</span>
						<span className="text-xs text-slate-400">
							共 {slots.length} 个时段
						</span>
					</div>
					<Button variant="primary" onClick={openCreateModal}>
						<Plus className="h-4 w-4" />
						新增时段
					</Button>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="bg-slate-50 text-xs font-semibold text-slate-500">
							<tr>
								<th className="px-4 py-3">时段编号</th>
								<th className="px-4 py-3">最大号源</th>
								<th className="px-4 py-3">已用</th>
								<th className="px-4 py-3">剩余</th>
								<th className="px-4 py-3">操作</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{slotsQuery.isLoading ? (
								<TableMessage colSpan={5}>正在加载时段...</TableMessage>
							) : null}
							{slotsQuery.isError ? (
								<TableMessage colSpan={5}>
									{getApiErrorMessage(slotsQuery.error)}
								</TableMessage>
							) : null}
							{!slotsQuery.isLoading &&
							!slotsQuery.isError &&
							slots.length === 0 ? (
								<TableMessage colSpan={5}>暂无时段</TableMessage>
							) : null}
							{slots.map((slot) => (
								<tr key={slot.id} className="transition hover:bg-blue-50/40">
									<td className="px-4 py-3 font-medium text-slate-900">
										{slot.slot}
										{/* slot 是整数标识，没有时间语义；按原型顺序映射出时间段便于核对。 */}
										{OUTPATIENT_TIME_SLOTS[slot.slot - 1] ? (
											<span className="ml-1.5 text-xs font-normal text-slate-400">
												{OUTPATIENT_TIME_SLOTS[slot.slot - 1]}
											</span>
										) : null}
									</td>
									<td className="px-4 py-3">{slot.maximum}</td>
									<td className="px-4 py-3">{slot.used}</td>
									<td className="px-4 py-3">{slot.remaining}</td>
									<td className="px-4 py-3">
										<div className="flex items-center gap-2">
											<Button onClick={() => openCapacityModal(slot)}>
												改容量
											</Button>
											<Button
												variant="danger"
												onClick={() => setDeleteSlotId(slot.id)}
											>
												删除
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			{/* 新增时段弹窗 */}
			<Modal
				open={createOpen}
				title="新增时段"
				onClose={() => {
					if (createMutation.isPending) return;
					setCreateOpen(false);
				}}
				footer={
					<>
						<Button
							onClick={() => setCreateOpen(false)}
							disabled={createMutation.isPending}
						>
							取消
						</Button>
						<Button
							variant="primary"
							onClick={handleCreateSubmit}
							disabled={createMutation.isPending}
						>
							{createMutation.isPending ? "处理中..." : "确定"}
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-4">
					<Field
						label="时段编号"
						required
						hint={`1-${CAPACITY_MAX} 的整数，同一计划内不可重复`}
					>
						<NumberInput
							value={createSlotText}
							min={1}
							max={CAPACITY_MAX}
							step={1}
							placeholder="例如 1"
							disabled={createMutation.isPending}
							onChange={(event) => setCreateSlotText(event.target.value)}
						/>
					</Field>
					<Field
						label="最大号源"
						required
						hint={`1-${CAPACITY_MAX} 的整数，表示该时段可挂号的号源上限`}
					>
						<NumberInput
							value={createMaximumText}
							min={1}
							max={CAPACITY_MAX}
							step={1}
							placeholder="例如 3"
							disabled={createMutation.isPending}
							onChange={(event) => setCreateMaximumText(event.target.value)}
						/>
					</Field>
					{createError ? <FormError>{createError}</FormError> : null}
				</div>
			</Modal>

			{/* 修改时段容量弹窗：只允许修改 maximum（规范 5.5 PATCH） */}
			<Modal
				open={capacitySlot !== null}
				title={
					capacitySlot ? `修改时段 ${capacitySlot.slot} 的容量` : "修改时段容量"
				}
				widthClassName="max-w-md"
				onClose={() => {
					if (updateMutation.isPending) return;
					setCapacitySlotId(null);
				}}
				footer={
					<>
						<Button
							onClick={() => setCapacitySlotId(null)}
							disabled={updateMutation.isPending}
						>
							取消
						</Button>
						<Button
							variant="primary"
							onClick={handleCapacitySubmit}
							disabled={updateMutation.isPending}
						>
							{updateMutation.isPending ? "处理中..." : "确定"}
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-4">
					<Field
						label="最大号源"
						required
						hint={`不能小于已用号源 ${capacitySlot?.used ?? 0}`}
					>
						<NumberInput
							value={capacityMaximumText}
							min={capacitySlot?.used ?? 0}
							max={CAPACITY_MAX}
							step={1}
							disabled={updateMutation.isPending}
							onChange={(event) => setCapacityMaximumText(event.target.value)}
						/>
					</Field>
					{capacityError ? <FormError>{capacityError}</FormError> : null}
				</div>
			</Modal>

			{/* 删除时段二次确认 */}
			<ConfirmDialog
				open={deleteSlot !== null}
				title="删除时段"
				danger
				confirmText="删除"
				loading={deleteMutation.isPending}
				message={
					deleteSlot
						? `确定删除时段 ${deleteSlot.slot} 吗？该时段已用 ${deleteSlot.used} 个号源，删除后不可恢复。`
						: ""
				}
				onConfirm={() => {
					if (deleteSlot === null || deleteMutation.isPending) return;
					deleteMutation.mutate(deleteSlot.id);
				}}
				onCancel={() => {
					if (deleteMutation.isPending) return;
					setDeleteSlotId(null);
				}}
			/>
		</div>
	);
}

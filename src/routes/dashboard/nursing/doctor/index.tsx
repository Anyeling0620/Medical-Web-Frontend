import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronsUpDown,
	Info,
	Search,
} from "lucide-react";
import { useState } from "react";
import {
	type Doctor,
	type DoctorStatus,
	getDoctorOptions,
	getDoctorsList,
	type PagedResult,
} from "@/api/doctors";
import { getApiErrorMessage } from "@/lib/api-error";

export const Route = createFileRoute("/dashboard/nursing/doctor/")({
	component: DoctorListPage,
});

const PAGE_SIZE = 20;

// doctor.status 展示映射：字符串语义来自规范 11.2（数据库 1=ACTIVE、2=RESIGNED、3=RETIRED、4=HIDDEN）。
const STATUS_META: Record<DoctorStatus, { label: string; badge: string }> = {
	ACTIVE: { label: "正常", badge: "bg-emerald-50 text-emerald-700" },
	RESIGNED: { label: "离职", badge: "bg-slate-100 text-slate-500" },
	RETIRED: { label: "退休", badge: "bg-slate-100 text-slate-500" },
	HIDDEN: { label: "隐藏", badge: "bg-amber-50 text-amber-700" },
};

// 列表页筛选条件：仅覆盖下拉框可选字段，查询时传给列表接口。
interface DoctorFilter {
	departmentId?: number;
	subdepartmentId?: number;
	job?: string;
	degree?: string;
}

function DoctorListPage() {
	const [page, setPage] = useState(1);
	// 表单“草稿”筛选条件：编辑下拉框时仅更新草稿，不立即请求。
	const [draftFilter, setDraftFilter] = useState<DoctorFilter>({});
	// 点击“查询”后真正生效的筛选条件，写入 queryKey 触发重新拉取。
	const [appliedFilter, setAppliedFilter] = useState<DoctorFilter>({});

	// GET /api/v1/catalog/doctors/options：动态下拉数据源（科室/子科室/职位/学位）。
	const optionsQuery = useQuery({
		queryKey: ["doctor-options"],
		queryFn: getDoctorOptions,
	});
	const departments = optionsQuery.data?.departments ?? [];
	// 子科室按所选科室过滤；未选科室时展示全部，避免范围误选。
	const subdepartments = (optionsQuery.data?.subdepartments ?? []).filter(
		(sub) =>
			draftFilter.departmentId == null ||
			sub.departmentId === draftFilter.departmentId,
	);
	const jobs = optionsQuery.data?.jobs ?? [];
	const degrees = optionsQuery.data?.degrees ?? [];

	// GET /api/v1/catalog/doctors 返回规范 1.1 的统一分页结构 { items, page, pageSize, total }。
	// appliedFilter 变化后才重新请求，实现“点击查询才刷新”。
	const doctorsQuery = useQuery({
		queryKey: [
			"doctors",
			page,
			PAGE_SIZE,
			appliedFilter.departmentId,
			appliedFilter.subdepartmentId,
			appliedFilter.job,
			appliedFilter.degree,
		],
		queryFn: (): Promise<PagedResult<Doctor>> =>
			getDoctorsList({
				...appliedFilter,
				page,
				pageSize: PAGE_SIZE,
				status: "ACTIVE",
			}),
	});
	const doctors: Doctor[] = doctorsQuery.data?.items ?? [];
	const total = doctorsQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	return (
		<main className="min-h-screen bg-[#f5f7fb] ">
			<div className="mx-auto max-w-[1600px]">
				<section className="flex justify-between border border-slate-200 bg-white p-4 shadow-sm mb-4">
					<div className="flex h-16 flex-wrap items-end gap-3">
						<FilterSelect
							label="科室"
							value={draftFilter.departmentId?.toString() ?? ""}
							onChange={(value) =>
								setDraftFilter((prev) => ({
									...prev,
									// 切换科室时清空已选的子科室，避免跨科室误选。
									departmentId: value ? Number(value) : undefined,
									subdepartmentId: undefined,
								}))
							}
							options={[
								{ value: "", label: "全部科室" },
								...departments.map((dep) => ({
									value: String(dep.id),
									label: dep.name,
								})),
							]}
						/>
						<FilterSelect
							label="子科室"
							value={draftFilter.subdepartmentId?.toString() ?? ""}
							onChange={(value) =>
								setDraftFilter((prev) => ({
									...prev,
									subdepartmentId: value ? Number(value) : undefined,
								}))
							}
							options={[
								{ value: "", label: "全部子科室" },
								...subdepartments.map((sub) => ({
									value: String(sub.id),
									label: sub.name,
								})),
							]}
						/>
						<FilterSelect
							label="学位"
							value={draftFilter.degree ?? ""}
							onChange={(value) =>
								setDraftFilter((prev) => ({
									...prev,
									degree: value || undefined,
								}))
							}
							options={[
								{ value: "", label: "全部学位" },
								...degrees.map((degree) => ({
									value: degree,
									label: degree,
								})),
							]}
						/>
						<FilterSelect
							label="职位"
							value={draftFilter.job ?? ""}
							onChange={(value) =>
								setDraftFilter((prev) => ({
									...prev,
									job: value || undefined,
								}))
							}
							options={[
								{ value: "", label: "全部职位" },
								...jobs.map((job) => ({
									value: job,
									label: job,
								})),
							]}
						/>
						<button
							type="button"
							onClick={() => {
								// 点击查询：提交草稿条件为生效条件并回到第一页。
								setAppliedFilter({ ...draftFilter });
								setPage(1);
							}}
							className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white transition hover:bg-blue-700"
						>
							<Search className="h-4 w-4" />
							查询
						</button>
					</div>

					{/* 只读提示：基础资料域第一阶段只读，不提供新增/删除等写操作 */}
					<div className="flex items-end">
						<span className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-500">
							<Info className="h-4 w-4" />
							基础资料域第一阶段只读
						</span>
					</div>
				</section>
				<section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
					<div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
						<div className="flex items-center gap-3">
							<span className="text-sm font-medium text-slate-700">
								医生信息
							</span>
							<span className="text-xs text-slate-400">共 {total} 条</span>
						</div>
					</div>
					<div className="overflow-x-auto">
						<table className="min-w-275 w-full text-left text-sm">
							<thead className="bg-slate-50 text-xs font-semibold text-slate-500">
								<tr>
									<SortableHeader label="姓名" />
									<SortableHeader label="性别" />
									<th className="px-4 py-3">毕业院校</th>
									<SortableHeader label="学位" />
									<SortableHeader label="职位" />
									<th className="px-4 py-3">推荐</th>
									<th className="px-4 py-3">状态</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{doctorsQuery.isLoading && (
									<TableMessage colSpan={7}>正在加载医生信息...</TableMessage>
								)}
								{doctorsQuery.isError && (
									<TableMessage colSpan={7}>
										{getApiErrorMessage(doctorsQuery.error)}
									</TableMessage>
								)}
								{!doctorsQuery.isLoading &&
									!doctorsQuery.isError &&
									doctors.length === 0 && (
										<TableMessage colSpan={7}>暂无医生数据</TableMessage>
									)}
								{doctors.map((doctor) => {
									const statusMeta =
										STATUS_META[doctor.status] ?? STATUS_META.HIDDEN;
									return (
										<tr
											key={doctor.id}
											className="transition hover:bg-blue-50/40"
										>
											<td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
												{doctor.name ? (
													<Link
														// 点击姓名跳转到医生详情页；该路由位于 /dashboard 布局下，to 需带前缀。
														to="/dashboard/nursing/doctor/$doctorId"
														params={{ doctorId: String(doctor.id) }}
														className="text-blue-600 transition hover:text-blue-700 hover:underline"
													>
														{doctor.name}
													</Link>
												) : (
													"-"
												)}
											</td>
											<td className="px-4 py-3">{doctor.sex || "-"}</td>
											<td className="px-4 py-3">{doctor.school || "-"}</td>
											<td className="px-4 py-3">{doctor.degree || "-"}</td>
											<td className="px-4 py-3">{doctor.job || "-"}</td>
											<td className="px-4 py-3">
												{doctor.recommended ? (
													<span className="text-emerald-600">是</span>
												) : (
													<span className="text-slate-400">否</span>
												)}
											</td>
											<td className="px-4 py-3">
												<span
													className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.badge}`}
												>
													{statusMeta.label}
												</span>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					<div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
						<span>
							第 {page} / {totalPages} 页，每页 {PAGE_SIZE} 条
						</span>
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => setPage((value) => Math.max(1, value - 1))}
								disabled={page === 1}
								className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
								aria-label="上一页"
								title="上一页"
							>
								<ChevronLeft className="h-4 w-4" />
							</button>
							<span className="px-2 text-xs text-slate-500">{page}</span>
							<button
								type="button"
								onClick={() =>
									setPage((value) => Math.min(totalPages, value + 1))
								}
								disabled={page >= totalPages}
								className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
								aria-label="下一页"
								title="下一页"
							>
								<ChevronRight className="h-4 w-4" />
							</button>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}

// 通用筛选下拉框：options 使用 { value, label }，受控 value 由父级传入。
function FilterSelect({
	label,
	value,
	onChange,
	options,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	options: { value: string; label: string }[];
}) {
	return (
		<label className="flex min-w-44 flex-1 flex-col gap-1.5 text-xs font-medium text-slate-500 sm:flex-none">
			{label}
			<span className="relative">
				<select
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 pr-9 text-sm font-normal text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
				>
					{options.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				<ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
			</span>
		</label>
	);
}
function SortableHeader({ label }: { label: string }) {
	return (
		<th className="px-4 py-3">
			<span className="inline-flex items-center gap-1">
				{label}
				<ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
			</span>
		</th>
	);
}
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

import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Info,
	Search,
} from "lucide-react";
import { useState } from "react";
import {
	type CatalogPagedResult,
	type Department,
	getDepartmentsList,
} from "@/api/catalog";
import { getApiErrorMessage } from "@/lib/api-error";

// 路由声明：科室管理列表页，渲染在 /dashboard 布局下。
export const Route = createFileRoute("/dashboard/catalog/department/")({
	component: DepartmentListPage,
});

// 列表默认每页条数（规范 1.1 统一分页结构）。
const PAGE_SIZE = 20;

// 是否门诊展示映射：outpatient 为 true 显示门诊，否则住院。
const OUTPATIENT_META = {
	true: { label: "门诊", badge: "bg-emerald-50 text-emerald-700" },
	false: { label: "住院", badge: "bg-slate-100 text-slate-500" },
};

// 筛选下拉选项：value 为 undefined 表示"全部"。
interface FilterOption {
	label: string;
	value: boolean | undefined;
}

// 把 boolean | undefined 转成 select 的字符串值，避免 undefined 无法作为 value。
function toSelectKey(value: boolean | undefined): string {
	if (value === undefined) return "all";
	return value ? "true" : "false";
}

// 把 select 的字符串值还原为 boolean | undefined。
function fromSelectKey(key: string): boolean | undefined {
	if (key === "all") return undefined;
	return key === "true";
}

function DepartmentListPage() {
	// 已生效的筛选条件与分页，参与查询。
	const [page, setPage] = useState(1);
	const [outpatient, setOutpatient] = useState<boolean | undefined>(undefined);
	const [recommended, setRecommended] = useState<boolean | undefined>(
		undefined,
	);
	// 草稿筛选条件，点击"查询"后才生效。
	const [draftOutpatient, setDraftOutpatient] = useState<boolean | undefined>(
		undefined,
	);
	const [draftRecommended, setDraftRecommended] = useState<boolean | undefined>(
		undefined,
	);

	// GET /api/v1/catalog/departments：queryKey 包含筛选条件与分页，条件变化时自动重新请求。
	const departmentsQuery = useQuery({
		queryKey: ["departments", outpatient, recommended, page, PAGE_SIZE],
		queryFn: (): Promise<CatalogPagedResult<Department>> =>
			getDepartmentsList({
				// 仅在明确选择时传参，避免向后端发送 undefined。
				...(outpatient !== undefined ? { outpatient } : {}),
				...(recommended !== undefined ? { recommended } : {}),
				page,
				pageSize: PAGE_SIZE,
			}),
	});
	const departments: Department[] = departmentsQuery.data?.items ?? [];
	const total = departmentsQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	// 点击查询：应用草稿筛选并重置回第一页。
	const handleQuery = () => {
		setOutpatient(draftOutpatient);
		setRecommended(draftRecommended);
		setPage(1);
	};

	return (
		<main className="min-h-screen bg-[#f5f7fb]">
			<div className="mx-auto max-w-[1600px]">
				{/* 顶部筛选条：门诊/推荐筛选 + 查询按钮 */}
				<section className="mb-4 flex justify-between border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex flex-wrap items-end gap-3">
						<FilterSelect
							label="门诊"
							value={draftOutpatient}
							onChange={setDraftOutpatient}
							options={[
								{ label: "全部", value: undefined },
								{ label: "门诊", value: true },
								{ label: "住院", value: false },
							]}
						/>
						<FilterSelect
							label="推荐"
							value={draftRecommended}
							onChange={setDraftRecommended}
							options={[
								{ label: "全部", value: undefined },
								{ label: "推荐", value: true },
								{ label: "非推荐", value: false },
							]}
						/>
						<button
							type="button"
							onClick={handleQuery}
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

				{/* 列表区 */}
				<section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
					<div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
						<div className="flex items-center gap-3">
							<span className="text-sm font-medium text-slate-700">
								科室信息
							</span>
							<span className="text-xs text-slate-400">共 {total} 条</span>
						</div>
					</div>

					<div className="overflow-x-auto">
						<table className="min-w-275 w-full text-left text-sm">
							<thead className="bg-slate-50 text-xs font-semibold text-slate-500">
								<tr>
									<th className="px-4 py-3">ID</th>
									<th className="px-4 py-3">名称</th>
									<th className="px-4 py-3">是否门诊</th>
									<th className="px-4 py-3">特色介绍</th>
									<th className="px-4 py-3">是否推荐</th>
									<th className="px-4 py-3">操作</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{/* 加载中 */}
								{departmentsQuery.isLoading && (
									<TableMessage colSpan={6}>正在加载科室信息...</TableMessage>
								)}
								{/* 请求失败：统一展示面向用户的错误文案 */}
								{departmentsQuery.isError && (
									<TableMessage colSpan={6}>
										{getApiErrorMessage(departmentsQuery.error)}
									</TableMessage>
								)}
								{/* 空数据 */}
								{!departmentsQuery.isLoading &&
									!departmentsQuery.isError &&
									departments.length === 0 && (
										<TableMessage colSpan={6}>暂无科室数据</TableMessage>
									)}
								{departments.map((department) => {
									const outpatientMeta = department.outpatient
										? OUTPATIENT_META.true
										: OUTPATIENT_META.false;
									return (
										<tr
											key={department.id}
											className="transition hover:bg-blue-50/40"
										>
											<td className="px-4 py-3 text-slate-500">
												{department.id}
											</td>
											<td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
												{department.name || "-"}
											</td>
											<td className="px-4 py-3">
												<span
													className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${outpatientMeta.badge}`}
												>
													{outpatientMeta.label}
												</span>
											</td>
											<td className="px-4 py-3">
												{department.description ? (
													// description 截断展示，悬停可查看完整内容
													<span
														className="block max-w-80 truncate text-slate-600"
														title={department.description}
													>
														{department.description}
													</span>
												) : (
													<span className="text-slate-400">-</span>
												)}
											</td>
											<td className="px-4 py-3">
												{department.recommended ? (
													<span className="text-emerald-600">是</span>
												) : (
													<span className="text-slate-400">否</span>
												)}
											</td>
											<td className="px-4 py-3">
												{/* 详情：跳转到科室详情页（挂在 /dashboard 布局下） */}
												<Link
													to="/dashboard/catalog/department/$departmentId"
													params={{ departmentId: String(department.id) }}
													className="text-blue-600 transition hover:text-blue-700 hover:underline"
												>
													详情
												</Link>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					{/* 分页：上一页/下一页/当前页码，每页条数 */}
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

// 筛选下拉：使用 select + 箭头，样式与医生管理页一致。
function FilterSelect({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: FilterOption[];
	value: boolean | undefined;
	onChange: (value: boolean | undefined) => void;
}) {
	return (
		<label className="flex min-w-44 flex-1 flex-col gap-1.5 text-xs font-medium text-slate-500 sm:flex-none">
			{label}
			<span className="relative">
				<select
					value={toSelectKey(value)}
					onChange={(event) => onChange(fromSelectKey(event.target.value))}
					className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 pr-9 text-sm font-normal text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
				>
					{options.map((option) => (
						<option
							key={toSelectKey(option.value)}
							value={toSelectKey(option.value)}
						>
							{option.label}
						</option>
					))}
				</select>
				<ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
			</span>
		</label>
	);
}

// 表格内的统一提示：加载中 / 请求失败 / 空数据复用。
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

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
	type CatalogOptions,
	type CatalogPagedResult,
	getCatalogOptions,
	getSubdepartments,
	type Subdepartment,
} from "@/api/catalog";
import { getApiErrorMessage } from "@/lib/api-error";

// 路由声明：子科室管理列表，渲染在 /dashboard 布局下。
// 菜单归属为「组织管理」父菜单（见 src/lib/navigation-menu.ts），路由路径保持历史值。
export const Route = createFileRoute("/dashboard/catalog/subdepartment/")({
	component: SubdepartmentListPage,
});

// 列表默认每页条数（接口规范 §1.4 统一分页结构）。
const PAGE_SIZE = 20;

function SubdepartmentListPage() {
	// 科室（父级）选项：子科室接口按科室分页查询，需要先确定科室。
	const optionsQuery = useQuery({
		queryKey: ["catalog-options"],
		queryFn: (): Promise<CatalogOptions> => getCatalogOptions(),
	});
	const departments = optionsQuery.data?.departments ?? [];

	// 已生效的科室与草稿科室：点击「查询」后草稿才生效。
	const [departmentId, setDepartmentId] = useState<number | null>(null);
	const [draftDepartmentId, setDraftDepartmentId] = useState<number | null>(
		null,
	);
	const [page, setPage] = useState(1);

	// 未显式选择时回落到第一个科室：进入页面即可看到数据，避免空白筛选态。
	const activeDepartmentId = departmentId ?? departments[0]?.id ?? null;
	const selectedDepartmentId = draftDepartmentId ?? activeDepartmentId;

	// GET /catalog/departments/{departmentId}/subdepartments：按选中科室分页查询子科室。
	const subdepartmentsQuery = useQuery({
		queryKey: ["subdepartments", activeDepartmentId, page, PAGE_SIZE],
		queryFn: (): Promise<CatalogPagedResult<Subdepartment>> =>
			getSubdepartments(activeDepartmentId as number, {
				page,
				pageSize: PAGE_SIZE,
			}),
		// 科室列表尚未返回时 activeDepartmentId 为 null，此时不发起请求。
		enabled: activeDepartmentId !== null,
	});

	const subdepartments: Subdepartment[] = subdepartmentsQuery.data?.items ?? [];
	const total = subdepartmentsQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	// 科室编号 -> 科室名称：列表接口只返回 departmentId，用于展示所属科室。
	const departmentNames = new Map(
		departments.map((department) => [department.id, department.name]),
	);

	// 点击查询：应用草稿科室并回到第一页。
	const handleQuery = () => {
		setDepartmentId(draftDepartmentId ?? activeDepartmentId);
		setPage(1);
	};

	return (
		<main className="min-h-screen bg-[#f5f7fb]">
			<div className="mx-auto max-w-[1600px]">
				{/* 顶部筛选条：科室下拉 + 查询按钮 */}
				<section className="mb-4 flex flex-wrap items-end justify-between gap-3 border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex flex-wrap items-end gap-3">
						<label className="flex min-w-44 flex-col gap-1.5 text-xs font-medium text-slate-500">
							所属科室
							<span className="relative">
								<select
									value={selectedDepartmentId ?? ""}
									onChange={(event) =>
										setDraftDepartmentId(
											event.target.value ? Number(event.target.value) : null,
										)
									}
									disabled={departments.length === 0}
									className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 pr-9 text-sm font-normal text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
								>
									{departments.length === 0 && (
										<option value="">
											{optionsQuery.isLoading ? "加载科室中..." : "暂无科室"}
										</option>
									)}
									{departments.map((department) => (
										<option key={department.id} value={department.id}>
											{department.name || `科室 ${department.id}`}
										</option>
									))}
								</select>
								<ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
							</span>
						</label>
						<button
							type="button"
							onClick={handleQuery}
							disabled={departments.length === 0}
							className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<Search className="h-4 w-4" />
							查询
						</button>
					</div>

					{/* 只读提示：基础资料域第一阶段只读，不提供新增/删除等写操作 */}
					<span className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-500">
						<Info className="h-4 w-4" />
						基础资料域第一阶段只读
					</span>
				</section>

				{/* 列表区 */}
				<section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
					<div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
						<span className="text-sm font-medium text-slate-700">
							子科室信息
						</span>
						<span className="text-xs text-slate-400">共 {total} 条</span>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full min-w-[900px] border-collapse text-sm">
							<thead>
								<tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
									<th className="px-4 py-3">子科室ID</th>
									<th className="px-4 py-3">子科室名称</th>
									<th className="px-4 py-3">所属科室</th>
									<th className="px-4 py-3">位置</th>
									<th className="px-4 py-3">操作</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{optionsQuery.isError && (
									<TableMessage colSpan={5} tone="error">
										{getApiErrorMessage(optionsQuery.error)}
									</TableMessage>
								)}
								{!optionsQuery.isError && departments.length === 0 && (
									<TableMessage colSpan={5}>
										{optionsQuery.isLoading
											? "正在加载科室..."
											: "暂无科室数据"}
									</TableMessage>
								)}
								{departments.length > 0 && subdepartmentsQuery.isLoading && (
									<TableMessage colSpan={5}>正在加载子科室...</TableMessage>
								)}
								{departments.length > 0 && subdepartmentsQuery.isError && (
									<TableMessage colSpan={5} tone="error">
										{getApiErrorMessage(subdepartmentsQuery.error)}
									</TableMessage>
								)}
								{departments.length > 0 &&
									!subdepartmentsQuery.isLoading &&
									!subdepartmentsQuery.isError &&
									subdepartments.length === 0 && (
										<TableMessage colSpan={5}>暂无子科室数据</TableMessage>
									)}
								{subdepartments.map((subdepartment) => (
									<tr
										key={subdepartment.id}
										className="transition hover:bg-blue-50/40"
									>
										<td className="px-4 py-3 text-slate-500">
											{subdepartment.id}
										</td>
										<td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
											{subdepartment.name || "-"}
										</td>
										<td className="px-4 py-3 text-slate-600">
											{departmentNames.get(subdepartment.departmentId) ??
												`科室 ${subdepartment.departmentId}`}
										</td>
										<td className="px-4 py-3 text-slate-600">
											{subdepartment.location || "-"}
										</td>
										<td className="px-4 py-3">
											{/* 详情：跳转到子科室详情页（挂在 /dashboard 布局下） */}
											<Link
												to="/dashboard/catalog/subdepartment/$subdepartmentId"
												params={{ subdepartmentId: String(subdepartment.id) }}
												className="text-blue-600 transition hover:text-blue-700 hover:underline"
											>
												详情
											</Link>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* 分页：上一页/下一页/当前页码 */}
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

// 表格内的统一提示：加载中 / 请求失败 / 空数据复用。
function TableMessage({
	children,
	colSpan,
	tone = "muted",
}: {
	children: string;
	colSpan: number;
	tone?: "muted" | "error";
}) {
	return (
		<tr>
			<td
				colSpan={colSpan}
				className={`px-4 py-12 text-center text-sm ${
					tone === "error" ? "text-rose-500" : "text-slate-400"
				}`}
			>
				{children}
			</td>
		</tr>
	);
}

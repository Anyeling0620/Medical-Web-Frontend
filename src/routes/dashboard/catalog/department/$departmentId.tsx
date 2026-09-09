import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
	type CatalogPagedResult,
	type Department,
	getDepartmentDetail,
	getSubdepartments,
	type Subdepartment,
} from "@/api/catalog";
import { getApiErrorMessage } from "@/lib/api-error";

// 路由声明：科室详情页，路径参数 $departmentId 取自 URL，渲染在 /dashboard 布局下。
export const Route = createFileRoute(
	"/dashboard/catalog/department/$departmentId",
)({
	component: DepartmentDetailPage,
});

// 子科室列表默认每页条数（规范约定默认 20）。
const PAGE_SIZE = 20;

function DepartmentDetailPage() {
	const navigate = useNavigate();
	// 从路径参数取出科室 ID（字符串），转换为 number 并校验为正整数。
	const { departmentId: departmentIdRaw } = Route.useParams();
	const departmentId = Number(departmentIdRaw);
	const isValidId = Number.isInteger(departmentId) && departmentId > 0;

	const [page, setPage] = useState(1);

	// 拉取科室详情：GET /catalog/departments/{departmentId}
	const detailQuery = useQuery({
		queryKey: ["department-detail", departmentId],
		queryFn: (): Promise<Department> => getDepartmentDetail(departmentId),
		enabled: isValidId,
	});

	// 拉取该科室下的子科室分页列表：GET /catalog/departments/{departmentId}/subdepartments
	const subdepartmentsQuery = useQuery({
		queryKey: ["department-subdepartments", departmentId, page, PAGE_SIZE],
		queryFn: (): Promise<CatalogPagedResult<Subdepartment>> =>
			getSubdepartments(departmentId, { page, pageSize: PAGE_SIZE }),
		enabled: isValidId,
	});

	const subdepartments: Subdepartment[] = subdepartmentsQuery.data?.items ?? [];
	const total = subdepartmentsQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const backToList = () =>
		void navigate({ to: "/dashboard/catalog/department" });

	// 非法科室编号统一按“无效参数”处理，避免发起无效请求。
	if (!isValidId) {
		return (
			<main className="min-h-screen bg-[#f5f7fb]">
				<div className="mx-auto max-w-[1600px]">
					<div className="mb-4">
						<BackButton onClick={backToList} />
					</div>
					<section className="border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
						科室编号无效，无法加载科室信息
					</section>
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-[#f5f7fb]">
			<div className="mx-auto max-w-[1600px]">
				{/* 返回按钮：回到科室列表 */}
				<div className="mb-4">
					<BackButton onClick={backToList} />
				</div>

				{/* 科室详情卡片 */}
				<section className="mb-4 border border-slate-200 bg-white p-5 shadow-sm">
					{detailQuery.isLoading && (
						<p className="text-sm text-slate-400">正在加载科室信息...</p>
					)}
					{detailQuery.isError && (
						<p className="text-sm text-red-600">
							{getApiErrorMessage(detailQuery.error)}
						</p>
					)}
					{!detailQuery.isLoading &&
						!detailQuery.isError &&
						!detailQuery.data && (
							<p className="text-sm text-slate-400">暂无科室信息</p>
						)}
					{detailQuery.data && (
						<div className="space-y-4">
							<div className="flex flex-wrap items-center gap-3">
								<h2 className="text-xl font-semibold text-slate-900">
									{detailQuery.data.name || "未命名科室"}
								</h2>
								<span
									className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
										detailQuery.data.outpatient
											? "bg-emerald-50 text-emerald-700"
											: "bg-slate-100 text-slate-500"
									}`}
								>
									{detailQuery.data.outpatient ? "门诊" : "住院"}
								</span>
								<span
									className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
										detailQuery.data.recommended
											? "bg-blue-50 text-blue-700"
											: "bg-slate-100 text-slate-500"
									}`}
								>
									{detailQuery.data.recommended ? "推荐" : "非推荐"}
								</span>
							</div>
							<dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<dt className="text-xs font-medium text-slate-500">
										科室名称
									</dt>
									<dd className="mt-1 text-sm text-slate-900">
										{detailQuery.data.name || "-"}
									</dd>
								</div>
								<div>
									<dt className="text-xs font-medium text-slate-500">
										是否门诊
									</dt>
									<dd className="mt-1 text-sm text-slate-900">
										{detailQuery.data.outpatient ? "是" : "否"}
									</dd>
								</div>
								<div>
									<dt className="text-xs font-medium text-slate-500">
										是否推荐
									</dt>
									<dd className="mt-1 text-sm text-slate-900">
										{detailQuery.data.recommended ? "是" : "否"}
									</dd>
								</div>
								<div className="md:col-span-2">
									<dt className="text-xs font-medium text-slate-500">
										特色介绍
									</dt>
									<dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
										{detailQuery.data.description || "暂无介绍"}
									</dd>
								</div>
							</dl>
						</div>
					)}
				</section>

				{/* 子科室列表 */}
				<section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
					<div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
						<span className="text-sm font-medium text-slate-700">
							子科室信息
						</span>
						<span className="text-xs text-slate-400">共 {total} 条</span>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
								<tr>
									<th className="px-4 py-3 font-medium">ID</th>
									<th className="px-4 py-3 font-medium">子科室名称</th>
									<th className="px-4 py-3 font-medium">位置</th>
									<th className="px-4 py-3 font-medium">操作</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{subdepartmentsQuery.isLoading && (
									<TableMessage colSpan={4}>正在加载子科室列表...</TableMessage>
								)}
								{subdepartmentsQuery.isError && (
									<TableMessage colSpan={4}>
										{getApiErrorMessage(subdepartmentsQuery.error)}
									</TableMessage>
								)}
								{!subdepartmentsQuery.isLoading &&
									!subdepartmentsQuery.isError &&
									subdepartments.length === 0 && (
										<TableMessage colSpan={4}>暂无子科室数据</TableMessage>
									)}
								{subdepartments.map((subdepartment) => (
									<tr
										key={subdepartment.id}
										className="transition hover:bg-blue-50/40"
									>
										<td className="px-4 py-3 text-slate-500">
											{subdepartment.id}
										</td>
										<td className="px-4 py-3 font-medium text-slate-900">
											{subdepartment.name || "-"}
										</td>
										<td className="px-4 py-3">
											{subdepartment.location || "-"}
										</td>
										<td className="px-4 py-3">
											<Link
												to="/dashboard/catalog/subdepartment/$subdepartmentId"
												params={{ subdepartmentId: String(subdepartment.id) }}
												className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-blue-600 transition hover:text-blue-700"
											>
												详情
												<ChevronRight className="h-3.5 w-3.5" />
											</Link>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{/* 分页 */}
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

// 返回科室列表按钮
function BackButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
		>
			<ChevronLeft className="h-4 w-4" />
			返回科室列表
		</button>
	);
}

// 表格空态/加载/错误提示行
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

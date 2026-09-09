import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import {
	getSubdepartmentDetail,
	type SubdepartmentDetail,
} from "@/api/catalog";
import { getApiErrorMessage } from "@/lib/api-error";

// 路由声明：子科室详情页，路径参数 $subdepartmentId 取自 URL。
export const Route = createFileRoute(
	"/dashboard/catalog/subdepartment/$subdepartmentId",
)({
	component: SubdepartmentDetailPage,
});

function SubdepartmentDetailPage() {
	const navigate = useNavigate();
	// 从路由参数取出子科室 ID（字符串），转换为 number 后请求详情。
	const { subdepartmentId } = Route.useParams();
	const detailId = Number(subdepartmentId);
	const isValidId = Number.isInteger(detailId) && detailId > 0;

	// 拉取子科室详情；路径参数非法（非数字）时不发起请求。
	const detailQuery = useQuery({
		queryKey: ["subdepartment-detail", detailId],
		queryFn: (): Promise<SubdepartmentDetail> =>
			getSubdepartmentDetail(detailId),
		enabled: isValidId,
	});

	const detail = detailQuery.data;

	// 返回按钮：回到科室列表页；如需退回上一页可使用 history.back()。
	const handleBack = () => {
		void navigate({ to: "/dashboard/catalog/department" });
	};

	return (
		<main className="min-h-screen bg-[#f5f7fb]">
			<div className="mx-auto max-w-[1600px]">
				<section className="mb-4 flex items-center justify-between border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={handleBack}
							className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50"
							aria-label="返回科室列表"
							title="返回科室列表"
						>
							<ChevronLeft className="h-4 w-4" />
						</button>
						<h1 className="text-base font-medium text-slate-700">子科室详情</h1>
					</div>
					<span className="text-xs text-slate-400">子科室ID：{detailId}</span>
				</section>

				<section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
					<div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
						<span className="text-sm font-medium text-slate-700">基础信息</span>
					</div>

					{/* 路径参数非法时的提示 */}
					{!isValidId && (
						<div className="px-4 py-12 text-center text-sm text-rose-500">
							无效的子科室ID
						</div>
					)}

					{/* 参数合法时根据查询状态渲染：加载中 / 失败 / 空态 / 详情 */}
					{isValidId && (
						<>
							{detailQuery.isLoading && (
								<div className="px-4 py-12 text-center text-sm text-slate-400">
									正在加载子科室详情...
								</div>
							)}

							{detailQuery.isError && (
								<div className="px-4 py-12 text-center text-sm text-rose-500">
									{getApiErrorMessage(detailQuery.error)}
								</div>
							)}

							{!detailQuery.isLoading && !detailQuery.isError && !detail && (
								<div className="px-4 py-12 text-center text-sm text-slate-400">
									暂无子科室数据
								</div>
							)}

							{!detailQuery.isLoading && !detailQuery.isError && detail && (
								<dl className="divide-y divide-slate-100">
									<DetailRow label="子科室名称">
										<span className="font-medium text-slate-900">
											{detail.name || "-"}
										</span>
									</DetailRow>

									<DetailRow label="所属科室">
										<Link
											to="/dashboard/catalog/department/$departmentId"
											params={{
												departmentId: String(detail.departmentId),
											}}
											className="text-blue-600 transition hover:text-blue-700"
										>
											{detail.department.name || "-"}
										</Link>
									</DetailRow>

									<DetailRow label="位置">
										<span className="text-slate-700">
											{detail.location || "-"}
										</span>
									</DetailRow>

									<DetailRow label="子科室ID">
										<span className="text-slate-700">{detail.id}</span>
									</DetailRow>

									<DetailRow label="所属科室ID">
										<span className="text-slate-700">
											{detail.departmentId}
										</span>
									</DetailRow>
								</dl>
							)}
						</>
					)}
				</section>
			</div>
		</main>
	);
}

// 详情行组件：统一的字段标签与取值展示，桌面端标签固定宽度。
function DetailRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
			<dt className="w-32 shrink-0 text-sm text-slate-500">{label}</dt>
			<dd className="text-sm text-slate-700">{children}</dd>
		</div>
	);
}

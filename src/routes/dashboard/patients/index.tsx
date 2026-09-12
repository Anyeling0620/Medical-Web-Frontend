import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Info, Search } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	type DoctorPatient,
	type DoctorPatientPaymentStatus,
	getDoctorPatients,
} from "@/api/doctor-patients";
import type { PagedResult } from "@/api/doctors";
import { getApiErrorMessage } from "@/lib/api-error";

// 路由声明：医生工作台「我的患者」列表，渲染在 /dashboard 布局下。
// 菜单入口只对医生账号展示（见 src/lib/navigation-menu.ts）；
// 非医生账号直接访问会收到后端 403，页面按错误提示展示。
export const Route = createFileRoute("/dashboard/patients/")({
	component: DoctorPatientsPage,
});

// 列表默认每页条数（接口规范 §1.4 统一分页结构）。
const PAGE_SIZE = 20;

// 支付状态展示映射：颜色与文案对齐挂号/支付域的词表（UNPAID/PAID/REFUNDED/EXPIRED）。
const PAYMENT_STATUS_META: Record<
	DoctorPatientPaymentStatus,
	{ label: string; badge: string }
> = {
	PAID: { label: "已支付", badge: "bg-emerald-50 text-emerald-700" },
	UNPAID: { label: "待支付", badge: "bg-amber-50 text-amber-700" },
	REFUNDED: { label: "已退款", badge: "bg-slate-100 text-slate-500" },
	EXPIRED: { label: "已过期", badge: "bg-rose-50 text-rose-600" },
};

function DoctorPatientsPage() {
	// 已生效的关键词与分页（参与查询）。
	const [keyword, setKeyword] = useState("");
	// 草稿关键词：点击「查询」后才生效。
	const [draftKeyword, setDraftKeyword] = useState("");
	const [page, setPage] = useState(1);

	// GET /api/v1/mis/doctor/patients：患者范围由后端按登录医生收敛，
	// 前端只提交关键词与分页（接口规范 §6.10）。
	const patientsQuery = useQuery({
		queryKey: ["doctor-patients", keyword, page, PAGE_SIZE],
		queryFn: (): Promise<PagedResult<DoctorPatient>> =>
			getDoctorPatients({
				...(keyword ? { keyword } : {}),
				page,
				pageSize: PAGE_SIZE,
			}),
	});

	const patients: DoctorPatient[] = patientsQuery.data?.items ?? [];
	const total = patientsQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	// 点击查询：应用草稿关键词并回到第一页。
	const handleQuery = () => {
		setKeyword(draftKeyword.trim());
		setPage(1);
	};

	return (
		<main className="min-h-screen bg-[#f5f7fb]">
			<div className="mx-auto max-w-[1600px]">
				{/* 顶部筛选条：姓名/电话关键词 + 查询按钮 */}
				<section className="mb-4 flex flex-wrap items-end justify-between gap-3 border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex flex-wrap items-center gap-3">
						<input
							className="h-10 w-64 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
							placeholder="按患者姓名或联系电话搜索"
							value={draftKeyword}
							onChange={(event) => setDraftKeyword(event.target.value)}
							onKeyDown={(event) => {
								// 回车等同点击查询，避免医生反复移动鼠标。
								if (event.key === "Enter") handleQuery();
							}}
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

					{/* 数据边界提示：列表只包含当前登录医生接诊过的患者 */}
					<span className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-500">
						<Info className="h-4 w-4" />
						仅显示本人的患者
					</span>
				</section>

				{/* 列表区：每行的「病历」入口跳转到病历管理页，并自动按该患者的 patientCardId 预填筛选 */}
				<section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
					<div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
						<span className="text-sm font-medium text-slate-700">患者信息</span>
						<span className="text-xs text-slate-400">共 {total} 位患者</span>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full min-w-[1100px] border-collapse text-sm">
							<thead>
								<tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
									<th className="px-4 py-3">患者姓名</th>
									<th className="px-4 py-3">性别</th>
									<th className="px-4 py-3">联系电话</th>
									<th className="px-4 py-3">出生日期</th>
									<th className="px-4 py-3">医保类型</th>
									<th className="px-4 py-3">就诊次数</th>
									<th className="px-4 py-3">最近就诊</th>
									<th className="px-4 py-3">最近支付状态</th>
									<th className="px-4 py-3">病史</th>
									<th className="px-4 py-3">操作</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{patientsQuery.isLoading && (
									<TableMessage colSpan={10}>正在加载患者列表...</TableMessage>
								)}
								{patientsQuery.isError && (
									<TableMessage colSpan={10} tone="error">
										{getApiErrorMessage(patientsQuery.error)}
									</TableMessage>
								)}
								{!patientsQuery.isLoading &&
									!patientsQuery.isError &&
									patients.length === 0 && (
										<TableMessage colSpan={10}>
											{keyword ? "没有匹配的患者" : "暂无患者数据"}
										</TableMessage>
									)}
								{patients.map((patient) => {
									const paymentMeta =
										PAYMENT_STATUS_META[patient.lastPaymentStatus] ??
										PAYMENT_STATUS_META.UNPAID;
									return (
										<tr
											key={patient.patientCardId}
											className="transition hover:bg-blue-50/40"
										>
											<td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
												{patient.name || "-"}
											</td>
											<td className="px-4 py-3 text-slate-600">
												{patient.sex || "-"}
											</td>
											<td className="whitespace-nowrap px-4 py-3 text-slate-600">
												{patient.tel || "-"}
											</td>
											<td className="whitespace-nowrap px-4 py-3 text-slate-600">
												{patient.birthday || "-"}
											</td>
											<td className="px-4 py-3 text-slate-600">
												{patient.insuranceType || "-"}
											</td>
											<td className="px-4 py-3 text-slate-600">
												{patient.registrationCount}
											</td>
											<td className="whitespace-nowrap px-4 py-3 text-slate-600">
												{patient.lastVisitDate || "-"}
											</td>
											<td className="px-4 py-3">
												<span
													className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${paymentMeta.badge}`}
												>
													{paymentMeta.label}
												</span>
											</td>
											<td className="px-4 py-3">
												{patient.medicalHistory.length > 0 ? (
													// 病史为字符串数组：用顿号连接展示，表格内截断，悬停查看完整内容
													<span
														className="block max-w-72 truncate text-slate-600"
														title={patient.medicalHistory.join("、")}
													>
														{patient.medicalHistory.join("、")}
													</span>
												) : (
													<span className="text-slate-400">-</span>
												)}
											</td>
											<td className="px-4 py-3">
												{/* 跳转到病历管理页，并由 search 自动按该患者筛选 */}
												<Link
													to="/dashboard/medical-records"
													search={{ patientCardId: patient.patientCardId }}
													className="text-blue-600 transition hover:text-blue-700 hover:underline"
												>
													病历
												</Link>
											</td>
										</tr>
									);
								})}
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
	children: ReactNode;
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

import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { type DoctorStatus, getDoctorDetail } from "@/api/doctors";
import { getApiErrorMessage } from "@/lib/api-error";

export const Route = createFileRoute("/dashboard/nursing/doctor/$doctorId")({
	component: DoctorDetailPage,
});

// doctor.status 展示映射（与列表页保持一致）。
const STATUS_META: Record<DoctorStatus, { label: string; badge: string }> = {
	ACTIVE: { label: "正常", badge: "bg-emerald-50 text-emerald-700" },
	RESIGNED: { label: "离职", badge: "bg-slate-100 text-slate-500" },
	RETIRED: { label: "退休", badge: "bg-slate-100 text-slate-500" },
	HIDDEN: { label: "隐藏", badge: "bg-amber-50 text-amber-700" },
};

// 根据生日（YYYY-MM-DD）计算年龄；无生日或日期非法时返回占位符。
function calcAge(birthday: string | null): string {
	if (!birthday) return "-";
	const birth = new Date(birthday);
	if (Number.isNaN(birth.getTime())) return "-";
	const age = Math.floor(
		(Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
	);
	return `${age} 岁`;
}

function DoctorDetailPage() {
	const { doctorId } = Route.useParams();
	const navigate = useNavigate();
	const id = Number(doctorId);
	const isValidId = Number.isInteger(id) && id > 0;
	// 头像加载失败时回退为占位色块。
	const [imgFailed, setImgFailed] = useState(false);

	// GET /api/v1/catalog/doctors/{doctorId}：详情含 subdepartments 与 prices。
	const doctorQuery = useQuery({
		queryKey: ["doctor-detail", id],
		queryFn: () => getDoctorDetail(id),
		enabled: isValidId,
	});
	const doctor = doctorQuery.data;
	const statusMeta = doctor
		? (STATUS_META[doctor.status] ?? STATUS_META.HIDDEN)
		: STATUS_META.HIDDEN;

	// 非法医生 ID：不发起请求，统一展示无效参数提示。
	if (!isValidId) {
		return (
			<main className="min-h-screen bg-[#f5f7fb]">
				<div className="mx-auto max-w-[1600px]">
					<section className="border border-slate-200 bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
						无效的医生ID
					</section>
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-[#f5f7fb]">
			<div className="mx-auto max-w-[1600px]">
				<section className="mb-4 border border-slate-200 bg-white p-4 shadow-sm">
					<button
						type="button"
						onClick={() => navigate({ to: "/dashboard/nursing/doctor" })}
						className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
					>
						<ArrowLeft className="h-4 w-4" />
						返回医生列表
					</button>
				</section>

				<section className="border border-slate-200 bg-white shadow-sm">
					{doctorQuery.isLoading && (
						<div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-400">
							<Loader2 className="h-4 w-4 animate-spin" />
							正在加载医生详情...
						</div>
					)}
					{doctorQuery.isError && (
						<div className="px-4 py-16 text-center text-sm text-slate-400">
							{getApiErrorMessage(doctorQuery.error)}
						</div>
					)}
					{!doctorQuery.isLoading && !doctorQuery.isError && !doctor && (
						<div className="px-4 py-16 text-center text-sm text-slate-400">
							未找到医生数据
						</div>
					)}
					{doctor && (
						<>
							{/* 基础信息区：头像 + 姓名 + 性别/年龄 */}
							<div className="flex flex-col gap-6 border-b border-slate-200 p-6 sm:flex-row sm:items-center">
								<div className="h-32 w-32 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
									{doctor.photoUrl && !imgFailed ? (
										<img
											src={doctor.photoUrl}
											alt={`${doctor.name}的头像`}
											onError={() => setImgFailed(true)}
											className="h-full w-full object-cover"
										/>
									) : (
										<div className="flex h-full w-full items-center justify-center text-3xl text-slate-400">
											{doctor.name?.slice(0, 1)}
										</div>
									)}
								</div>
								<div className="flex flex-col gap-3">
									<h2 className="text-xl font-semibold text-slate-900">
										{doctor.name}
									</h2>
									<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
										<span>性别：{doctor.sex || "-"}</span>
										<span>
											年龄/出生：
											{doctor.birthday
												? `${calcAge(doctor.birthday)}（${doctor.birthday}）`
												: "-"}
										</span>
										{doctor.recommended && (
											<span className="text-emerald-600">推荐医生</span>
										)}
										<span
											className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.badge}`}
										>
											{statusMeta.label}
										</span>
									</div>
								</div>
							</div>

							{/* 详细字段区 */}
							<div className="grid gap-x-8 gap-y-4 p-6 sm:grid-cols-2">
								<InfoItem label="学历" value={doctor.degree || "-"} />
								<InfoItem label="职位" value={doctor.job || "-"} />
								<InfoItem label="毕业院校" value={doctor.school || "-"} />
								<InfoItem label="入职日期" value={doctor.hireDate || "-"} />
								<InfoItem label="备注" value={doctor.remark || "-"} />
								<InfoItem label="擅长/简介" value={doctor.description || "-"} />
							</div>

							{/* 标签 */}
							<div className="border-t border-slate-200 p-6">
								<h3 className="mb-3 text-sm font-semibold text-slate-700">
									标签
								</h3>
								{(doctor.tags ?? []).length > 0 ? (
									<div className="flex flex-wrap gap-2">
										{(doctor.tags ?? []).map((tag) => (
											<span
												key={tag}
												className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600"
											>
												{tag}
											</span>
										))}
									</div>
								) : (
									<span className="text-sm text-slate-400">暂无标签</span>
								)}
							</div>

							{/* 所属子科室 */}
							<div className="border-t border-slate-200 p-6">
								<h3 className="mb-3 text-sm font-semibold text-slate-700">
									所属子科室
								</h3>
								{(doctor.subdepartments ?? []).length > 0 ? (
									<ul className="flex flex-wrap gap-2">
										{(doctor.subdepartments ?? []).map((sub) => (
											<li
												key={sub.id}
												className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
											>
												{sub.name}
											</li>
										))}
									</ul>
								) : (
									<span className="text-sm text-slate-400">暂无子科室</span>
								)}
							</div>

							{/* 医生价格 */}
							<div className="border-t border-slate-200 p-6">
								<h3 className="mb-3 text-sm font-semibold text-slate-700">
									医生价格
								</h3>
								{(doctor.prices ?? []).length > 0 ? (
									<table className="min-w-275 w-full text-left text-sm">
										<thead className="bg-slate-50 text-xs font-semibold text-slate-500">
											<tr>
												<th className="px-4 py-3">级别</th>
												<th className="px-4 py-3">挂号费</th>
												<th className="px-4 py-3">诊金</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-slate-100">
											{(doctor.prices ?? []).map((price) => (
												<tr key={price.id}>
													<td className="px-4 py-3">{price.level}</td>
													<td className="px-4 py-3">{price.price1}</td>
													<td className="px-4 py-3">{price.price2}</td>
												</tr>
											))}
										</tbody>
									</table>
								) : (
									<span className="text-sm text-slate-400">暂无价格数据</span>
								)}
							</div>
						</>
					)}
				</section>
			</div>
		</main>
	);
}

// 详情页信息行：展示字段标签与值。
function InfoItem({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-medium text-slate-400">{label}</span>
			<span className="text-sm text-slate-700">{value}</span>
		</div>
	);
}

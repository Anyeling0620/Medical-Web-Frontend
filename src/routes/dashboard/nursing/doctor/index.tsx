import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronsUpDown,
	Plus,
	Search,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { type Doctor, getDoctorsList } from "@/api/getDoctorsList.ts";

export const Route = createFileRoute("/dashboard/nursing/doctor/")({
	component: DoctorListPage,
});

const PAGE_SIZE = 10;

type DoctorListResponse =
	| Doctor[]
	| {
			data?: Doctor[] | { list?: Doctor[]; records?: Doctor[]; total?: number };
			list?: Doctor[];
			records?: Doctor[];
			total?: number;
			totalCount?: number;
	  };

function normalizeResponse(response: DoctorListResponse) {
	if (Array.isArray(response))
		return { doctors: response, total: response.length };
	const nested =
		response.data && !Array.isArray(response.data) ? response.data : undefined;
	const doctors = Array.isArray(response.data)
		? response.data
		: (response.list ??
			response.records ??
			nested?.list ??
			nested?.records ??
			[]);
	return {
		doctors,
		total:
			response.total ?? response.totalCount ?? nested?.total ?? doctors.length,
	};
}

function DoctorListPage() {
	const [page, setPage] = useState(1);
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [isFolded, setIsFolded] = useState(false);
	const doctorsQuery = useQuery({
		queryKey: ["doctors", page, PAGE_SIZE],
		queryFn: () =>
			getDoctorsList({
				page,
				length: PAGE_SIZE,
				status: 1,
			}) as Promise<DoctorListResponse>,
	});
	const result = doctorsQuery.data
		? normalizeResponse(doctorsQuery.data)
		: null;
	const doctors = result?.doctors ?? [];
	const total = result?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const allVisibleSelected =
		doctors.length > 0 && doctors.every((doctor) => selectedIds.has(doctor.id));
	const toggleAllVisible = () =>
		setSelectedIds((current) => {
			const next = new Set(current);
			doctors.forEach((doctor) => {
				if (allVisibleSelected) next.delete(doctor.id);
				else next.add(doctor.id);
			});
			return next;
		});
	const toggleSelected = (id: number) =>
		setSelectedIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<main className="min-h-screen bg-[#f5f7fb] ">
			<div className="mx-auto max-w-[1600px]">
				<section className="mb-4 border border-slate-200 bg-white p-4 shadow-sm flex justify-between">
					<div className="flex flex-wrap items-end gap-3 h-16">
						<FilterSelect label="科室" options={["全部科室", "内科", "外科"]} />
						<FilterSelect
							label="学位"
							options={["全部学位", "博士", "硕士", "本科"]}
						/>
						<FilterSelect
							label="职位"
							options={["全部职位", "主任医师", "副主任医师", "主治医师"]}
						/>
						<button
							type="button"
							className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white transition hover:bg-blue-700"
						>
							<Search className="h-4 w-4" />
							查询
						</button>
					</div>

					<div className={"flex flex-wrap items-end gap-3 h-16"}>

						<button
							type="button"
							className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
						>
							<Plus className="h-4 w-4" />
							新增
						</button>
						<button
							type="button"
							className="inline-flex h-10 items-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700"
						>
							<Trash2 className="h-4 w-4" />
							批量删除
						</button>
					</div>
				</section>
				<section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
					<div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={() => setIsFolded((value) => !value)}
								className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50"
								aria-label={isFolded ? "展开列表" : "折叠列表"}
								title={isFolded ? "展开列表" : "折叠列表"}
							>
								{isFolded ? (
									<ChevronRight className="h-4 w-4" />
								) : (
									<ChevronDown className="h-4 w-4" />
								)}
							</button>
							<span className="text-sm font-medium text-slate-700">
								医生信息
							</span>
							<span className="text-xs text-slate-400">共 {total} 条</span>
						</div>
						{selectedIds.size > 0 && (
							<span className="text-xs text-blue-600">
								已选择 {selectedIds.size} 条
							</span>
						)}
					</div>
					{!isFolded && (
						<>
							<div className="overflow-x-auto">
								<table className="min-w-[1100px] w-full text-left text-sm">
									<thead className="bg-slate-50 text-xs font-semibold text-slate-500">
										<tr>
											<th className="w-12 px-4 py-3">
												<input
													type="checkbox"
													checked={allVisibleSelected}
													onChange={toggleAllVisible}
													aria-label="选择当前页全部医生"
													className="h-4 w-4 rounded border-slate-300 accent-blue-600"
												/>
											</th>
											<SortableHeader label="姓名" />
											<SortableHeader label="性别" />
											<th className="px-4 py-3">联系电话</th>
											<th className="px-4 py-3">毕业院校</th>
											<SortableHeader label="学位" />
											<SortableHeader label="职位" />
											<th className="px-4 py-3">所属科室</th>
											<th className="px-4 py-3">亚专科</th>
											<th className="px-4 py-3">推荐</th>
											<th className="px-4 py-3">状态</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{doctorsQuery.isLoading && (
											<TableMessage colSpan={11}>
												正在加载医生信息...
											</TableMessage>
										)}
										{doctorsQuery.isError && (
											<TableMessage colSpan={11}>
												医生信息加载失败，请稍后重试
											</TableMessage>
										)}
										{!doctorsQuery.isLoading &&
											!doctorsQuery.isError &&
											doctors.length === 0 && (
												<TableMessage colSpan={11}>暂无医生数据</TableMessage>
											)}
										{doctors.map((doctor) => (
											<tr
												key={doctor.id}
												className="transition hover:bg-blue-50/40"
											>
												<td className="px-4 py-3">
													<input
														type="checkbox"
														checked={selectedIds.has(doctor.id)}
														onChange={() => toggleSelected(doctor.id)}
														aria-label={`选择${doctor.name}`}
														className="h-4 w-4 rounded border-slate-300 accent-blue-600"
													/>
												</td>
												<td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
													{doctor.name || "-"}
												</td>
												<td className="px-4 py-3">{doctor.sex || "-"}</td>
												<td className="px-4 py-3">{doctor.tel || "-"}</td>
												<td className="px-4 py-3">{doctor.school || "-"}</td>
												<td className="px-4 py-3">{doctor.degree || "-"}</td>
												<td className="px-4 py-3">{doctor.job || "-"}</td>
												<td className="px-4 py-3">{doctor.deptName || "-"}</td>
												<td className="px-4 py-3">{doctor.subName || "-"}</td>
												<td className="px-4 py-3">
													{doctor.recommended ? (
														<span className="text-emerald-600">是</span>
													) : (
														<span className="text-slate-400">否</span>
													)}
												</td>
												<td className="px-4 py-3">
													<span
														className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${doctor.status === 1 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
													>
														{doctor.status === 1 ? "正常" : "停用"}
													</span>
												</td>
											</tr>
										))}
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
						</>
					)}
				</section>
			</div>
		</main>
	);
}

function FilterSelect({
	label,
	options,
}: {
	label: string;
	options: string[];
}) {
	return (
		<label className="flex min-w-44 flex-1 flex-col gap-1.5 text-xs font-medium text-slate-500 sm:flex-none">
			{label}
			<span className="relative">
				<select className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 pr-9 text-sm font-normal text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
					{options.map((option) => (
						<option key={option}>{option}</option>
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

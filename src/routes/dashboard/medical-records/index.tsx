// 病历管理页（接口规范 §13；入口还包括「我的患者」列表 §6.10 行内的「病历」链接）。
//
// 依赖的契约小节：
// - §13.6 GET /api/v1/medical-records：分页查询本人负责的病历，支持 registrationId / patientCardId 过滤；
//   本域不提供排序参数（显式传 sort/order 会 422），列表固定按 id 倒序，因此这里只提交筛选与分页。
// - §13.5 POST /api/v1/medical-records：必须携带 Idempotency-Key（§1.5），
//   body 为 { registrationId, diagnosis, content }；diagnosis 1-200 字符、content 1-20000 字符，首尾空白由后端裁剪。
// - §13.8 PATCH /api/v1/medical-records/{medicalRecordId}：至少提交 diagnosis 或 content 中的一个字段。
// - §13.9 DELETE /api/v1/medical-records/{medicalRecordId}：成功返回 204。
// - §13.11 取号顺序：§6.10 的患者列表不返回 registrationId，必须用 listRegistrations({ doctorId, patientCardId })
//   反查该患者在本医生处的挂号，由医生选中本次就诊后再书写病历。
//
// 关键交互说明：
// - 幂等键：每次打开「新建病历」弹窗生成一次并保存在 state，整个提交周期复用同一把键，
//   避免重复点击或网络重试在服务端写出两份病历。
// - 409 MEDICAL_RECORD_DUPLICATE：同一挂号只允许一份病历，提示「该挂号已有病历，请改用修改」。
// - doctorId 来源：登录响应写入 localStorage 的 mis_user.ref_id（useStoredUser，§1.2），
//   为 null 表示账号未绑定医生身份，此时病历接口返回 403，页面按错误文案提示而不是崩溃。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
	createMedicalRecord,
	createMedicalRecordIdempotencyKey,
	deleteMedicalRecord,
	listMedicalRecords,
	type MedicalRecord,
	type MedicalRecordCreateInput,
	updateMedicalRecord,
} from "@/api/medical-records";
import { listRegistrations, type RegistrationItem } from "@/api/registrations";
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
import { useStoredUser } from "@/lib/stored-user";

// 列表默认每页条数（接口规范 §1.4 统一分页结构）。
const PAGE_SIZE = 20;
// 挂号下拉的取数上限：§1.4 单页最多 100 条，取第 1 页即该患者最近的挂号。
const REGISTRATION_PAGE_SIZE = 100;
// 字段长度上限与后端一致（§13.5），前端先校验，避免无谓的 422 往返。
const DIAGNOSIS_MAX_LENGTH = 200;
const CONTENT_MAX_LENGTH = 20000;

// 搜索参数：患者列表的「病历」入口用 Link 带 patientCardId 跳入，进来后自动按该患者筛选。
interface MedicalRecordsSearch {
	patientCardId?: number;
}

// 解析正整数：空串、小数、0、负数、非数字一律视为「未传」，
// 避免坏参数进入查询或请求体后由后端返回 422。
function parsePositiveInteger(value: unknown): number | undefined {
	const text = typeof value === "number" ? String(value) : value;
	if (typeof text !== "string") return undefined;
	const trimmed = text.trim();
	if (!/^[1-9]\d*$/.test(trimmed)) return undefined;
	return Number(trimmed);
}

// 挂号下拉的展示文案：编号 + 就诊卡编号 + 就诊日期 + 时段。
// 必须带上就诊卡编号：未按患者筛选时下拉列出的是该医生的全部挂号，
// 只给编号与日期无法区分是哪位患者，容易把病历写到错误患者名下（§13.11）。
function formatRegistrationLabel(registration: RegistrationItem): string {
	return `挂号 #${registration.id} · 患者卡${registration.patientCardId} · ${registration.date || "-"} · 时段${registration.slot}`;
}

// 病历接口只服务医生账号：账号未绑定医生（mis_user.ref_id 为空）会返回 403，
// 这里给出可读提示，避免只显示笼统的「没有操作权限」。
function describeMedicalRecordError(error: unknown): string {
	if (isApiError(error) && error.status === 403) {
		return "当前账号未绑定医生身份或缺少病历权限，无法查看病历";
	}
	return getApiErrorMessage(error);
}

export const Route = createFileRoute("/dashboard/medical-records/")({
	// 只接受正整数 patientCardId，其它值按未传处理，保证 search 的形状稳定。
	validateSearch: (search: Record<string, unknown>): MedicalRecordsSearch => {
		const patientCardId = parsePositiveInteger(search.patientCardId);
		return patientCardId === undefined ? {} : { patientCardId };
	},
	component: MedicalRecordsPage,
});

function MedicalRecordsPage() {
	const search = Route.useSearch();
	const queryClient = useQueryClient();
	// 医生编号：非 null 表示当前账号绑定了医生，是查挂号与书写病历的前提。
	const { doctorId } = useStoredUser();

	// 已生效的筛选（参与查询）与草稿筛选（点击「查询」后才生效）。
	const [patientCardId, setPatientCardId] = useState<number | undefined>(
		search.patientCardId,
	);
	const [draftPatientCardId, setDraftPatientCardId] = useState(
		search.patientCardId === undefined ? "" : String(search.patientCardId),
	);
	const [page, setPage] = useState(1);

	// 从不同患者的「病历」入口跳入时 search 会变化，需要同步预填筛选条件。
	useEffect(() => {
		setPatientCardId(search.patientCardId);
		setDraftPatientCardId(
			search.patientCardId === undefined ? "" : String(search.patientCardId),
		);
		setPage(1);
	}, [search.patientCardId]);

	// GET /api/v1/medical-records（§13.6）：只提交筛选与分页，不传 sort/order。
	const recordsQuery = useQuery({
		queryKey: ["medical-records", patientCardId ?? null, page, PAGE_SIZE],
		queryFn: () =>
			listMedicalRecords({
				...(patientCardId === undefined ? {} : { patientCardId }),
				page,
				pageSize: PAGE_SIZE,
			}),
	});

	const records: MedicalRecord[] = recordsQuery.data?.items ?? [];
	const total = recordsQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	// 查看 / 修改 / 删除的目标病历。
	const [viewRecord, setViewRecord] = useState<MedicalRecord | null>(null);
	const [editRecord, setEditRecord] = useState<MedicalRecord | null>(null);
	const [deleteRecord, setDeleteRecord] = useState<MedicalRecord | null>(null);

	// 新建病历弹窗状态。
	const [createOpen, setCreateOpen] = useState(false);
	// 幂等键：与「本次提交内容」的指纹绑定，内容不变时复用、内容变化时换新键（§1.5 / §13.5）。
	// 不能整段弹窗生命周期只用一把键：后端会把 409/404/422 也写入幂等存储并按 key 原样重放，
	// 若内容已改还复用旧键，医生改完挂号再提交仍会拿到上一次的 409，只能关弹窗重开。
	const [createIdempotencyKey, setCreateIdempotencyKey] = useState("");
	// 上面那把键对应的提交内容指纹（registrationId|diagnosis|content）。
	const [createIdempotencySignature, setCreateIdempotencySignature] =
		useState("");
	const [createRegistrationId, setCreateRegistrationId] = useState("");
	const [createDiagnosis, setCreateDiagnosis] = useState("");
	const [createContent, setCreateContent] = useState("");
	const [createError, setCreateError] = useState("");

	// 修改病历表单状态。
	const [editDiagnosis, setEditDiagnosis] = useState("");
	const [editContent, setEditContent] = useState("");
	const [editError, setEditError] = useState("");

	// 挂号选项：§13.11 要求先确定 registrationId，因此按 doctorId + 当前筛选的患者卡编号反查。
	// enabled 限定在「弹窗已打开且账号已绑定医生」：未绑定医生时接口必然 403，不必发起请求。
	const registrationsQuery = useQuery({
		queryKey: ["medical-record-registrations", doctorId, patientCardId ?? null],
		queryFn: () =>
			listRegistrations({
				...(doctorId === null ? {} : { doctorId }),
				...(patientCardId === undefined ? {} : { patientCardId }),
				page: 1,
				pageSize: REGISTRATION_PAGE_SIZE,
			}),
		enabled: createOpen && doctorId !== null,
	});
	const registrationOptions: RegistrationItem[] =
		registrationsQuery.data?.items ?? [];

	// 创建（§13.5）：必须携带幂等键；重复提交复用同一把键，服务端只写一条。
	const createMutation = useMutation({
		// 幂等键随变量一起传入：它必须与本次请求体匹配，不能读可能已过期的 state 闭包值。
		mutationFn: (variables: {
			input: MedicalRecordCreateInput;
			idempotencyKey: string;
		}) => createMedicalRecord(variables.input, variables.idempotencyKey),
		onSuccess: async () => {
			showMessage("right", "病历创建成功");
			setCreateOpen(false);
			// 新病历按 id 倒序排在首页，回到第 1 页便于医生核对结果。
			setPage(1);
			await queryClient.invalidateQueries({ queryKey: ["medical-records"] });
		},
		onError: (error) => {
			// 409：同一挂号已有病历，提示改用「修改」。
			if (isApiError(error) && error.code === "MEDICAL_RECORD_DUPLICATE") {
				setCreateError("该挂号已有病历，请改用修改");
				return;
			}
			// 422/403 等：直接展示后端文案（getApiErrorMessage 已做兜底）。
			setCreateError(getApiErrorMessage(error));
		},
	});

	// 修改（§13.8）：诊断与正文都已非空，统一提交两个字段。
	const updateMutation = useMutation({
		mutationFn: (variables: {
			medicalRecordId: number;
			diagnosis: string;
			content: string;
		}) =>
			updateMedicalRecord(variables.medicalRecordId, {
				diagnosis: variables.diagnosis,
				content: variables.content,
			}),
		onSuccess: async () => {
			showMessage("right", "病历修改成功");
			setEditRecord(null);
			await queryClient.invalidateQueries({ queryKey: ["medical-records"] });
		},
		onError: (error) => {
			// 404：病历已被删除（或不属于本人负责的挂号），按「已不存在」处理并刷新列表。
			if (isApiError(error) && error.code === "MEDICAL_RECORD_NOT_FOUND") {
				showMessage("warn", "该病历已不存在，已刷新列表");
				setEditRecord(null);
				void queryClient.invalidateQueries({ queryKey: ["medical-records"] });
				return;
			}
			setEditError(getApiErrorMessage(error));
		},
	});

	// 删除（§13.9，成功 204）。
	const deleteMutation = useMutation({
		mutationFn: (medicalRecordId: number) =>
			deleteMedicalRecord(medicalRecordId),
		onSuccess: async () => {
			showMessage("right", "病历删除成功");
			setDeleteRecord(null);
			// 删掉的正好是本页最后一条时回退一页，避免停在越界的空白页。
			if (records.length === 1 && page > 1) setPage(page - 1);
			await queryClient.invalidateQueries({ queryKey: ["medical-records"] });
		},
		onError: (error) => {
			if (isApiError(error) && error.code === "MEDICAL_RECORD_NOT_FOUND") {
				// 已被他人删除：不当作失败提示，刷新列表即可。
				showMessage("warn", "该病历已不存在，已刷新列表");
			} else {
				showMessage("wrong", getApiErrorMessage(error));
			}
			setDeleteRecord(null);
			void queryClient.invalidateQueries({ queryKey: ["medical-records"] });
		},
	});

	// 点击查询：应用草稿的患者卡编号并回到第 1 页。
	const handleQuery = () => {
		setPatientCardId(parsePositiveInteger(draftPatientCardId));
		setPage(1);
	};

	// 打开新建弹窗：清空上一次的表单残留。幂等键与内容指纹在首次提交时按内容重新生成，
	// 清空指纹即可保证新一次弹窗必然拿到新键，无需在此预生成。
	const openCreateModal = () => {
		setCreateIdempotencySignature("");
		setCreateRegistrationId("");
		setCreateDiagnosis("");
		setCreateContent("");
		setCreateError("");
		setCreateOpen(true);
	};

	const openEditModal = (record: MedicalRecord) => {
		setEditRecord(record);
		setEditDiagnosis(record.diagnosis);
		setEditContent(record.content);
		setEditError("");
	};

	// 新建校验：挂号必选，诊断与正文非空且不超长，全部通过后才提交。
	const handleCreateSubmit = () => {
		if (createMutation.isPending) return;
		const registrationId = parsePositiveInteger(createRegistrationId);
		if (registrationId === undefined) {
			setCreateError("请选择挂号");
			return;
		}
		const diagnosis = createDiagnosis.trim();
		if (!diagnosis) {
			setCreateError("请输入诊断");
			return;
		}
		if (diagnosis.length > DIAGNOSIS_MAX_LENGTH) {
			setCreateError(`诊断不能超过 ${DIAGNOSIS_MAX_LENGTH} 个字符`);
			return;
		}
		const content = createContent.trim();
		if (!content) {
			setCreateError("请输入病历正文");
			return;
		}
		if (content.length > CONTENT_MAX_LENGTH) {
			setCreateError(`病历正文不能超过 ${CONTENT_MAX_LENGTH} 个字符`);
			return;
		}
		setCreateError("");
		// 提交内容指纹：挂号/诊断/正文任一变化都算一次新请求，必须换新幂等键；
		// 内容不变时复用同一把键，双击或网络重试仍只写一份病历（§1.5）。
		const signature = `${registrationId}|${diagnosis}|${content}`;
		const idempotencyKey =
			createIdempotencyKey && signature === createIdempotencySignature
				? createIdempotencyKey
				: createMedicalRecordIdempotencyKey();
		setCreateIdempotencySignature(signature);
		setCreateIdempotencyKey(idempotencyKey);
		// 本地已 trim，与后端「首尾空白会被裁剪」的口径保持一致。
		createMutation.mutate({
			input: { registrationId, diagnosis, content },
			idempotencyKey,
		});
	};

	// 修改校验：PATCH 至少提交一个字段，这里固定提交诊断与正文，两者都必须非空。
	const handleEditSubmit = () => {
		if (editRecord === null || updateMutation.isPending) return;
		const diagnosis = editDiagnosis.trim();
		if (!diagnosis) {
			setEditError("请输入诊断");
			return;
		}
		if (diagnosis.length > DIAGNOSIS_MAX_LENGTH) {
			setEditError(`诊断不能超过 ${DIAGNOSIS_MAX_LENGTH} 个字符`);
			return;
		}
		const content = editContent.trim();
		if (!content) {
			setEditError("请输入病历正文");
			return;
		}
		if (content.length > CONTENT_MAX_LENGTH) {
			setEditError(`病历正文不能超过 ${CONTENT_MAX_LENGTH} 个字符`);
			return;
		}
		setEditError("");
		updateMutation.mutate({
			medicalRecordId: editRecord.id,
			diagnosis,
			content,
		});
	};
	return (
		<main className="min-h-screen bg-[#f5f7fb]">
			<div className="mx-auto max-w-[1600px]">
				{/* 顶部筛选条：患者卡编号 + 查询 + 新建病历（主按钮） */}
				<section className="mb-4 flex flex-wrap items-end justify-between gap-3 border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex flex-wrap items-end gap-3">
						<div className="min-w-48">
							<Field label="患者卡编号" hint="按就诊卡查看某位患者的既往病历">
								<NumberInput
									value={draftPatientCardId}
									min={1}
									step={1}
									placeholder="例如 10"
									onChange={(event) =>
										setDraftPatientCardId(event.target.value)
									}
									onKeyDown={(event) => {
										// 回车等同点击「查询」，减少鼠标操作。
										if (event.key === "Enter") handleQuery();
									}}
								/>
							</Field>
						</div>
						<Button variant="primary" className="px-5" onClick={handleQuery}>
							<Search className="h-4 w-4" />
							查询
						</Button>
					</div>

					<Button variant="primary" className="px-5" onClick={openCreateModal}>
						<Plus className="h-4 w-4" />
						新建病历
					</Button>
				</section>

				{/* 列表区 */}
				<section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
					<div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
						<span className="text-sm font-medium text-slate-700">病历信息</span>
						<span className="text-xs text-slate-400">共 {total} 份病历</span>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full min-w-[1200px] border-collapse text-sm">
							<thead>
								<tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
									<th className="px-4 py-3">病历ID</th>
									<th className="px-4 py-3">患者卡编号</th>
									<th className="px-4 py-3">挂号编号</th>
									<th className="px-4 py-3">诊断</th>
									<th className="px-4 py-3">病历正文</th>
									<th className="px-4 py-3">操作</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{recordsQuery.isLoading && (
									<TableMessage colSpan={6}>正在加载病历列表...</TableMessage>
								)}
								{recordsQuery.isError && (
									<TableMessage colSpan={6} tone="error">
										{describeMedicalRecordError(recordsQuery.error)}
									</TableMessage>
								)}
								{!recordsQuery.isLoading &&
									!recordsQuery.isError &&
									records.length === 0 && (
										<TableMessage colSpan={6}>
											{patientCardId === undefined
												? "暂无病历数据"
												: `患者卡 ${patientCardId} 暂无病历`}
										</TableMessage>
									)}
								{records.map((record) => (
									<tr
										key={record.id}
										className="transition hover:bg-blue-50/40"
									>
										<td className="px-4 py-3 text-slate-500">{record.id}</td>
										<td className="px-4 py-3 text-slate-600">
											{record.patientCardId}
										</td>
										<td className="px-4 py-3 text-slate-600">
											{record.registrationId}
										</td>
										<td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
											{record.diagnosis || "-"}
										</td>
										<td className="px-4 py-3 text-slate-600">
											{/* 正文可能很长：单元格内截断，悬停 title 查看全文 */}
											<span
												className="block max-w-96 truncate"
												title={record.content}
											>
												{record.content || "-"}
											</span>
										</td>
										<td className="px-4 py-3">
											<div className="flex items-center gap-1">
												<Button
													className="h-8 px-2"
													onClick={() => setViewRecord(record)}
												>
													查看
												</Button>
												<Button
													className="h-8 px-2"
													onClick={() => openEditModal(record)}
												>
													修改
												</Button>
												<Button
													variant="danger"
													className="h-8 px-2"
													onClick={() => setDeleteRecord(record)}
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

			{/* 新建病历弹窗（§13.5）：先选挂号（§13.11），再填诊断与正文 */}
			<Modal
				open={createOpen}
				title="新建病历"
				widthClassName="max-w-2xl"
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
							disabled={createMutation.isPending || doctorId === null}
						>
							{createMutation.isPending ? "提交中..." : "确定"}
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-4">
					{doctorId === null ? (
						// 账号未绑定医生身份（mis_user.ref_id 为空）：接口返回 403，这里提前说明原因。
						<FormError>当前账号未绑定医生身份，无法书写病历</FormError>
					) : (
						<>
							<Field
								label="选择挂号"
								required
								hint={
									patientCardId === undefined
										? "未按患者筛选：以下为本人的全部挂号，请按患者卡编号核对"
										: "只能为本人负责的挂号书写病历"
								}
							>
								<SelectInput
									value={createRegistrationId}
									disabled={
										createMutation.isPending || registrationsQuery.isLoading
									}
									onChange={(event) =>
										setCreateRegistrationId(event.target.value)
									}
								>
									<option value="">
										{registrationsQuery.isLoading
											? "正在加载挂号..."
											: "请选择挂号"}
									</option>
									{registrationOptions.map((registration) => (
										<option key={registration.id} value={registration.id}>
											{formatRegistrationLabel(registration)}
										</option>
									))}
								</SelectInput>
							</Field>
							{registrationsQuery.isError ? (
								<FormError>
									{getApiErrorMessage(registrationsQuery.error)}
								</FormError>
							) : null}
							{!registrationsQuery.isLoading &&
							!registrationsQuery.isError &&
							registrationOptions.length === 0 ? (
								<p className="text-xs text-slate-400">
									{patientCardId === undefined
										? "暂无可选挂号"
										: "该患者暂无挂号记录"}
								</p>
							) : null}
						</>
					)}
					<Field
						label="诊断"
						required
						hint={`1-${DIAGNOSIS_MAX_LENGTH} 个字符`}
					>
						<TextInput
							value={createDiagnosis}
							maxLength={DIAGNOSIS_MAX_LENGTH}
							placeholder="例如：上呼吸道感染"
							disabled={createMutation.isPending}
							onChange={(event) => setCreateDiagnosis(event.target.value)}
						/>
					</Field>
					<Field
						label="病历正文"
						required
						hint={`1-${CONTENT_MAX_LENGTH} 个字符`}
					>
						<textarea
							className={`${inputClassName} min-h-40 py-2`}
							value={createContent}
							maxLength={CONTENT_MAX_LENGTH}
							placeholder="主诉、现病史、查体、处理意见等"
							disabled={createMutation.isPending}
							onChange={(event) => setCreateContent(event.target.value)}
						/>
					</Field>
					{createError ? <FormError>{createError}</FormError> : null}
				</div>
			</Modal>

			{/* 查看病历（只读）：展示全部字段，正文用 whitespace-pre-wrap 保留换行 */}
			<Modal
				open={viewRecord !== null}
				title={viewRecord ? `病历 #${viewRecord.id}` : "病历详情"}
				widthClassName="max-w-2xl"
				onClose={() => setViewRecord(null)}
				footer={
					<Button variant="primary" onClick={() => setViewRecord(null)}>
						关闭
					</Button>
				}
			>
				{viewRecord ? (
					<div className="flex flex-col gap-4">
						<div className="grid grid-cols-2 gap-4">
							<ReadonlyField label="病历ID" value={String(viewRecord.id)} />
							<ReadonlyField label="病历UUID" value={viewRecord.uuid} />
							<ReadonlyField
								label="患者卡编号"
								value={String(viewRecord.patientCardId)}
							/>
							<ReadonlyField
								label="挂号编号"
								value={String(viewRecord.registrationId)}
							/>
							<ReadonlyField
								label="医生编号"
								value={String(viewRecord.doctorId)}
							/>
							<ReadonlyField
								label="子科室编号"
								value={String(viewRecord.subdepartmentId)}
							/>
						</div>
						<ReadonlyField label="诊断" value={viewRecord.diagnosis} />
						<div className="flex flex-col gap-1">
							<span className="text-xs font-medium text-slate-500">
								病历正文
							</span>
							<div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
								{viewRecord.content || "-"}
							</div>
						</div>
					</div>
				) : null}
			</Modal>

			{/* 修改病历（§13.8）：PATCH 至少提交一个字段，这里固定提交诊断与正文 */}
			<Modal
				open={editRecord !== null}
				title={editRecord ? `修改病历 #${editRecord.id}` : "修改病历"}
				widthClassName="max-w-2xl"
				onClose={() => {
					if (updateMutation.isPending) return;
					setEditRecord(null);
				}}
				footer={
					<>
						<Button
							onClick={() => setEditRecord(null)}
							disabled={updateMutation.isPending}
						>
							取消
						</Button>
						<Button
							variant="primary"
							onClick={handleEditSubmit}
							disabled={updateMutation.isPending}
						>
							{updateMutation.isPending ? "提交中..." : "确定"}
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-4">
					<Field
						label="诊断"
						required
						hint={`1-${DIAGNOSIS_MAX_LENGTH} 个字符`}
					>
						<TextInput
							value={editDiagnosis}
							maxLength={DIAGNOSIS_MAX_LENGTH}
							disabled={updateMutation.isPending}
							onChange={(event) => setEditDiagnosis(event.target.value)}
						/>
					</Field>
					<Field
						label="病历正文"
						required
						hint={`1-${CONTENT_MAX_LENGTH} 个字符`}
					>
						<textarea
							className={`${inputClassName} min-h-40 py-2`}
							value={editContent}
							maxLength={CONTENT_MAX_LENGTH}
							disabled={updateMutation.isPending}
							onChange={(event) => setEditContent(event.target.value)}
						/>
					</Field>
					{editError ? <FormError>{editError}</FormError> : null}
				</div>
			</Modal>

			{/* 删除病历二次确认（§13.9） */}
			<ConfirmDialog
				open={deleteRecord !== null}
				title="删除病历"
				danger
				confirmText="删除"
				loading={deleteMutation.isPending}
				message={
					deleteRecord
						? `确定删除病历 #${deleteRecord.id}（诊断：${deleteRecord.diagnosis}）吗？删除后不可恢复。`
						: ""
				}
				onConfirm={() => {
					if (deleteRecord === null || deleteMutation.isPending) return;
					deleteMutation.mutate(deleteRecord.id);
				}}
				onCancel={() => {
					if (deleteMutation.isPending) return;
					setDeleteRecord(null);
				}}
			/>
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

// 查看弹窗中的只读字段。
function ReadonlyField({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-medium text-slate-500">{label}</span>
			<span className="break-words text-sm text-slate-800">{value || "-"}</span>
		</div>
	);
}

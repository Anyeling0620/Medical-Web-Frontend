// 接口规范 §13：病历域 /api/v1/medical-records 访问层。
// 查询需要 MEDICAL_RECORD:SELECT，写入分别需要 MEDICAL_RECORD:INSERT/UPDATE/DELETE。
// 本域刻意不把 ROOT 放进放行名单：ROOT 账号按「未绑定医生身份」处理，一律 403（规范 §13.1）。
// 规范 1.5：POST 创建接口必须携带 Idempotency-Key；项目约定明确不做 If-Match 乐观并发。
import { ajax } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import type { PagedResult } from "./doctors";

// 病历资源（规范 §13.2/§13.5）：列表项与详情返回同一字段集合（均含 content）。
export interface MedicalRecord {
	id: number;
	uuid: string;
	registrationId: number;
	patientCardId: number;
	doctorId: number;
	subdepartmentId: number;
	diagnosis: string;
	content: string;
}

// GET /api/v1/medical-records 查询参数（规范 §13.6）。
// 本域不提供 sort/order：显式传入会返回 422 REQUEST_VALIDATION_FAILED，
// 因此本层绝不携带排序参数，排序固定为 id 倒序。
export interface MedicalRecordListParams {
	registrationId?: number;
	patientCardId?: number;
	doctorId?: number;
	page?: number;
	pageSize?: number;
}

// POST /api/v1/medical-records 请求体（规范 §13.5）：registrationId、diagnosis、content 均必传。
export interface MedicalRecordCreateInput {
	registrationId: number;
	diagnosis: string;
	content: string;
}

// PATCH /api/v1/medical-records/{medicalRecordId} 请求体（规范 §13.8）：diagnosis 与 content 至少提交一个。
export interface MedicalRecordUpdateInput {
	diagnosis?: string;
	content?: string;
}

// 创建病历使用的幂等键（规范 1.5）：前缀固定为 medical-record，便于日志定位。
export function createMedicalRecordIdempotencyKey(): string {
	return createIdempotencyKey("medical-record");
}

// GET /api/v1/medical-records：分页查询当前医生负责的病历，默认 page=1、pageSize=20。
export function listMedicalRecords(
	params: MedicalRecordListParams = {},
): Promise<PagedResult<MedicalRecord>> {
	const { page = 1, pageSize = 20, ...filters } = params;
	return ajax<PagedResult<MedicalRecord>>({
		url: "/medical-records",
		method: "GET",
		data: { ...filters, page, pageSize },
	});
}

// GET /api/v1/medical-records/{medicalRecordId}：读取病历详情。
// 404 MEDICAL_RECORD_NOT_FOUND 表示病历不存在或不属于当前医生负责的挂号。
// 当前页面用列表行数据展示详情，暂无调用点；保留以保证本域 API 与契约 §13.4 的接口清单一致。
export function getMedicalRecord(
	medicalRecordId: number,
): Promise<MedicalRecord> {
	return ajax<MedicalRecord>({
		url: `/medical-records/${medicalRecordId}`,
		method: "GET",
	});
}

// POST /api/v1/medical-records：创建病历，成功返回 201 与资源对象。
// 必须携带 Idempotency-Key（缺失 422）；同一挂号已有病历返回 409 MEDICAL_RECORD_DUPLICATE；
// 挂号不存在或不由当前医生负责返回 404 REGISTRATION_NOT_FOUND；账号未绑定医生返回 403 AUTH_FORBIDDEN。
export function createMedicalRecord(
	input: MedicalRecordCreateInput,
	idempotencyKey: string = createMedicalRecordIdempotencyKey(),
): Promise<MedicalRecord> {
	return ajax<MedicalRecord>({
		url: "/medical-records",
		method: "POST",
		data: input,
		idempotencyKey,
	});
}

// PATCH /api/v1/medical-records/{medicalRecordId}：修改 diagnosis/content 中的至少一个字段，
// 成功返回更新后的完整资源；本接口不使用幂等键，也不需要 If-Match。
export function updateMedicalRecord(
	medicalRecordId: number,
	input: MedicalRecordUpdateInput,
): Promise<MedicalRecord> {
	return ajax<MedicalRecord>({
		url: `/medical-records/${medicalRecordId}`,
		method: "PATCH",
		data: input,
	});
}

// DELETE /api/v1/medical-records/{medicalRecordId}：成功 204 无响应体（ajax 返回 undefined）。
// 规范 §13.9 只要求携带 Authorization，因此本层不附加幂等键。
export function deleteMedicalRecord(medicalRecordId: number): Promise<void> {
	return ajax<void>({
		url: `/medical-records/${medicalRecordId}`,
		method: "DELETE",
	});
}

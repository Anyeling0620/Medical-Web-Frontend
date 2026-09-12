// 医生工作台：当前登录医生本人的患者列表（接口规范 §6.10、§12.4）。
//
// 该接口不接受 doctorId 查询参数：患者范围完全由访问令牌主体对应的
// mis_user.ref_id 决定，前端只需提交筛选与分页。
import { ajax } from "../lib/api";
import type { PagedResult } from "./doctors";

// 挂号支付状态（规范 §6 统一对外字符串语义）。
export type DoctorPatientPaymentStatus =
	| "UNPAID"
	| "PAID"
	| "REFUNDED"
	| "EXPIRED";

// 排序白名单：与后端 §6.10 的 sort 取值一一对应。
export type DoctorPatientSortField =
	| "lastVisitDate"
	| "name"
	| "registrationCount";

export type DoctorPatientSortOrder = "asc" | "desc";

// 患者列表项：就诊卡基础信息 + 该患者在本医生处的就诊统计。
// 后端不返回身份证号与就诊卡 user_id，因此本类型也不声明这两个字段。
export interface DoctorPatient {
	patientCardId: number;
	name: string;
	sex: string;
	tel: string;
	// 空串表示就诊卡未登记该项（后端对缺失值统一输出空串，不输出 null）。
	birthday: string;
	// 疾病史为字符串数组，空数组表示未登记（与患者端就诊卡接口口径一致）。
	medicalHistory: string[];
	insuranceType: string;
	registrationCount: number;
	lastVisitDate: string;
	lastPaymentStatus: DoctorPatientPaymentStatus;
}

export interface DoctorPatientSearchParams {
	// 按姓名或联系电话模糊匹配；空串表示不过滤。
	keyword?: string;
	page?: number;
	pageSize?: number;
	sort?: DoctorPatientSortField;
	order?: DoctorPatientSortOrder;
}

// 获取当前医生的患者分页列表
// GET /api/v1/mis/doctor/patients
export function getDoctorPatients(
	params: DoctorPatientSearchParams = {},
): Promise<PagedResult<DoctorPatient>> {
	const { page = 1, pageSize = 20, ...filters } = params;
	return ajax<PagedResult<DoctorPatient>>({
		url: "/mis/doctor/patients",
		method: "GET",
		data: { ...filters, page, pageSize },
	});
}

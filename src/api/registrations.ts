// 接口规范 §6.3：挂号记录 /api/v1/registrations 查询访问层。
// 患者域令牌只返回当前患者自己的挂号记录；管理端令牌需要 REGISTRATION:SELECT（或 ROOT）权限码。
import { ajax } from "../lib/api";
import type { PagedResult } from "./doctors";

// 挂号记录列表项（规范 §6.3）：只声明前端当前使用的字段。
export interface RegistrationItem {
	id: number;
	patientCardId: number;
	doctorId: number;
	subdepartmentId: number;
	date: string;
	slot: number;
	amount: string;
	paymentStatus: string;
	createDate: string;
}

// GET /api/v1/registrations 查询参数（规范 §6.3）：除分页外均可选。
export interface RegistrationListParams {
	patientCardId?: number;
	doctorId?: number;
	page?: number;
	pageSize?: number;
}

// GET /api/v1/registrations：分页查询挂号记录，默认 page=1、pageSize=20。
export function listRegistrations(
	params: RegistrationListParams = {},
): Promise<PagedResult<RegistrationItem>> {
	const { page = 1, pageSize = 20, ...filters } = params;
	return ajax<PagedResult<RegistrationItem>>({
		url: "/registrations",
		method: "GET",
		data: { ...filters, page, pageSize },
	});
}

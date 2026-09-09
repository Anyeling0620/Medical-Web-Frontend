// 接口规范 4.2/11.2：医生目录 /api/v1/catalog/doctors（第一阶段只读，
// 不提供医生新增/修改/删除；列表不含 tel、部门/亚专科名称等禁止字段）
import { ajax } from "../lib/api";

// doctor.status 对外语义（数据库 1=ACTIVE、2=RESIGNED、3=RETIRED、4=HIDDEN）
export type DoctorStatus = "ACTIVE" | "RESIGNED" | "RETIRED" | "HIDDEN";

export type DoctorSortField = "name" | "hireDate" | "recommended" | "id";
export type SortOrder = "asc" | "desc";

// 列表项字段与规范 11.2 GET /api/v1/catalog/doctors 输出一致
export interface Doctor {
	id: number;
	name: string;
	sex: string | null;
	photoUrl: string | null;
	birthday: string | null;
	school: string | null;
	degree: string | null;
	job: string | null;
	remark: string | null;
	description: string | null;
	hireDate: string | null;
	tags: string[];
	recommended: boolean;
	status: DoctorStatus;
	createDate: string | null;
}

// 规范 1.1：列表统一分页结构 { items, page, pageSize, total }
export interface PagedResult<T> {
	items: T[];
	page: number;
	pageSize: number;
	total: number;
}

// GET /api/v1/catalog/doctors 查询参数；status 默认 ACTIVE
export interface DoctorSearchParams {
	departmentId?: number;
	subdepartmentId?: number;
	name?: string;
	job?: string;
	degree?: string;
	recommended?: boolean;
	status?: DoctorStatus;
	page?: number;
	pageSize?: number;
	sort?: DoctorSortField;
	order?: SortOrder;
}

export interface DepartmentOption {
	id: number;
	name: string;
}

export interface SubdepartmentOption {
	id: number;
	name: string;
	departmentId: number;
}

// GET /api/v1/catalog/doctors/options 筛选项
export interface DoctorOptions {
	departments: DepartmentOption[];
	subdepartments: SubdepartmentOption[];
	jobs: string[];
	degrees: string[];
}

export interface DoctorPrice {
	id: number;
	doctorId: number;
	level: string;
	price1: string;
	price2: string;
}

// GET /api/v1/catalog/doctors/{doctorId}：详情含 subdepartments 与 prices
export interface DoctorDetail extends Doctor {
	subdepartments: { id: number; name: string }[];
	prices: DoctorPrice[];
}

export function getDoctorsList(params: DoctorSearchParams = {}) {
	const { page = 1, pageSize = 10, status = "ACTIVE", ...filters } = params;
	return ajax<PagedResult<Doctor>>({
		url: "/catalog/doctors",
		method: "GET",
		data: {
			...filters,
			status,
			page,
			pageSize,
		},
	});
}

export function getDoctorOptions() {
	return ajax<DoctorOptions>({
		url: "/catalog/doctors/options",
		method: "GET",
	});
}

export function getDoctorDetail(doctorId: number) {
	return ajax<DoctorDetail>({
		url: `/catalog/doctors/${doctorId}`,
		method: "GET",
	});
}

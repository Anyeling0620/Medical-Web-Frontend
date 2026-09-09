// 基础资料域 /catalog 第一阶段只读接口（接口规范 11.2）。
// 涵盖科室、子科室、目录筛选项与医生挂号价格；仅提供查询，不提供增删改。
import { ajax } from "../lib/api";

// 科室：id、名称、是否门诊、简介、是否推荐（规范 11.2 科室字段）
export interface Department {
	id: number;
	name: string;
	outpatient: boolean;
	description: string | null;
	recommended: boolean;
}

// 子科室（亚专科）：id、名称、所属科室 id、位置（规范 11.2）
export interface Subdepartment {
	id: number;
	name: string;
	departmentId: number;
	location: string | null;
}

// 子科室详情：在基础字段基础上携带所属科室（id、名称）摘要
export interface SubdepartmentDetail extends Subdepartment {
	department: { id: number; name: string };
}

// 统一分页结构：{ items, page, pageSize, total }（接口规范 1.1）
export interface CatalogPagedResult<T> {
	items: T[];
	page: number;
	pageSize: number;
	total: number;
}

// GET /catalog/departments 查询参数：门诊/推荐筛选、分页与排序
export interface DepartmentSearchParams {
	outpatient?: boolean;
	recommended?: boolean;
	page?: number;
	pageSize?: number;
	sort?: "name" | "id";
	order?: "asc" | "desc";
}

// 医生挂号价格：level 名称与两个档位金额（金额以十进制字符串返回，规范 1.1）
export interface DoctorPrice {
	id: number;
	doctorId: number;
	level: string;
	price1: string;
	price2: string;
}

// GET /catalog/doctors/options 筛选项：科室/子科室/职位/学位
export interface CatalogOptions {
	departments: { id: number; name: string }[];
	subdepartments: Subdepartment[];
	jobs: string[];
	degrees: string[];
}

// 获取科室分页列表
export function getDepartmentsList(
	params: DepartmentSearchParams = {},
): Promise<CatalogPagedResult<Department>> {
	// GET /catalog/departments
	const { page = 1, pageSize = 20, ...filters } = params;
	return ajax<CatalogPagedResult<Department>>({
		url: "/catalog/departments",
		method: "GET",
		data: { ...filters, page, pageSize },
	});
}

// 获取单个科室详情
export function getDepartmentDetail(departmentId: number): Promise<Department> {
	// GET /catalog/departments/{departmentId}
	return ajax<Department>({
		url: `/catalog/departments/${departmentId}`,
		method: "GET",
	});
}

// 获取某科室下的子科室分页列表
export function getSubdepartments(
	departmentId: number,
	params: {
		page?: number;
		pageSize?: number;
		sort?: string;
		order?: "asc" | "desc";
	} = {},
): Promise<CatalogPagedResult<Subdepartment>> {
	// GET /catalog/departments/{departmentId}/subdepartments
	const { page = 1, pageSize = 20, ...filters } = params;
	return ajax<CatalogPagedResult<Subdepartment>>({
		url: `/catalog/departments/${departmentId}/subdepartments`,
		method: "GET",
		data: { ...filters, page, pageSize },
	});
}

// 获取单个子科室详情
export function getSubdepartmentDetail(
	subdepartmentId: number,
): Promise<SubdepartmentDetail> {
	// GET /catalog/subdepartments/{subdepartmentId}
	return ajax<SubdepartmentDetail>({
		url: `/catalog/subdepartments/${subdepartmentId}`,
		method: "GET",
	});
}

// 获取科室/子科室/职位/学位筛选列表
// 说明：与 src/api/doctors.ts 的 getDoctorOptions 对应，两者均指向 GET /catalog/doctors/options，
// 此处保留为对契约“获取科室/子科室/职位/学位列表”的完整实现。
export function getCatalogOptions(): Promise<CatalogOptions> {
	// GET /catalog/doctors/options（即“获取科室/子科室/职位/学位列表”）
	return ajax<CatalogOptions>({
		url: "/catalog/doctors/options",
		method: "GET",
	});
}

// 获取指定医生的挂号价格分页列表
// 说明：与 src/api/doctors.ts 的 DoctorPrice 对应，契约中该价格域名与医生目录共享同一数据源。
export function getDoctorPrices(params: {
	doctorId: number;
	page?: number;
	pageSize?: number;
}): Promise<CatalogPagedResult<DoctorPrice>> {
	// GET /catalog/doctor-prices
	const { doctorId, page = 1, pageSize = 20 } = params;
	return ajax<CatalogPagedResult<DoctorPrice>>({
		url: "/catalog/doctor-prices",
		method: "GET",
		data: { doctorId, page, pageSize },
	});
}

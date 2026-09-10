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

// 需要展示姓名/进入筛选下拉的医生状态：接口 status 缺省为 ACTIVE，
// 已离职、退休医生的历史排班仍要显示姓名，因此必须显式按状态分别查询后合并。
// HIDDEN（隐藏医生）不对管理端展示，不纳入。
const VISIBLE_DOCTOR_STATUSES: DoctorStatus[] = [
	"ACTIVE",
	"RESIGNED",
	"RETIRED",
];

// GET /api/v1/catalog/doctors 全量拉取：先取第 1 页，再按响应回显的 pageSize 取完剩余页。
// 目的：单页最多 100 条（规范 1.4），只取第 1 页会让超出上限的医生退化成「医生 #id」。
// pageSize 沿用调用方（或接口默认）的值，不做调整。
export async function getAllDoctors(
	params: DoctorSearchParams = {},
): Promise<Doctor[]> {
	const first = await getDoctorsList({ ...params, page: 1 });
	// 以响应回显的分页参数为准，避免请求参数被服务端调整后算错页数。
	const pageSize = first.pageSize > 0 ? first.pageSize : first.items.length;
	const totalPages = pageSize > 0 ? Math.ceil(first.total / pageSize) : 1;
	if (totalPages <= 1) return first.items;

	const remaining = await Promise.all(
		Array.from({ length: totalPages - 1 }, (_, index) =>
			getDoctorsList({ ...params, page: index + 2 }),
		),
	);
	return [...first.items, ...remaining.flatMap((result) => result.items)];
}

// 全量拉取「可见医生」：ACTIVE + RESIGNED + RETIRED 三种状态分别分页取完后合并。
// 用于医生姓名映射与筛选下拉，保证已离职/退休医生也能查到、姓名不缺失。
export async function getAllDoctorsIncludingInactive(
	params: DoctorSearchParams = {},
): Promise<Doctor[]> {
	const results = await Promise.all(
		VISIBLE_DOCTOR_STATUSES.map((status) =>
			getAllDoctors({ ...params, status }),
		),
	);
	return results.flat();
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

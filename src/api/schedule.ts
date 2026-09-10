// 接口规范 5（排班域 /api/v1/schedule）与 12.3（JSON 示例）：出诊计划与出诊时间段访问层。
// 查询需要 SCHEDULE:SELECT（或 ROOT），写操作需要 SCHEDULE:WRITE（或 ROOT）。
// 规范 1.5：POST 创建接口必须携带 Idempotency-Key。
// 项目约定：明确不做 If-Match 乐观并发（后端不下发 etag，PATCH 也不校验），写操作只带幂等键。
import { ajax } from "../lib/api";

export type SortOrder = "asc" | "desc";

// GET /schedule/plans 的排序白名单：仅 date/doctorId/id（规范 5.1，服务端拒绝其他字段）。
export type PlanSortField = "date" | "doctorId" | "id";

// 规范 1.1：列表统一返回 { items, page, pageSize, total }。
export interface SchedulePagedResult<T> {
	items: T[];
	page: number;
	pageSize: number;
	total: number;
}

// 出诊时间段（doctor_work_plan_schedule）：slot 是既有整数时段标识，契约不赋予具体时间语义。
export interface ScheduleSlot {
	id: number;
	workPlanId: number;
	slot: number;
	maximum: number;
	used: number;
	remaining: number;
}

// 出诊计划（doctor_work_plan）：used/remaining 由服务端计算，remaining = maximum - used。
export interface WorkPlan {
	id: number;
	doctorId: number;
	subdepartmentId: number;
	// 规范 1.1：date 按业务语义序列化为 YYYY-MM-DD。
	date: string;
	maximum: number;
	used: number;
	remaining: number;
	// 仅 includeSlots=true 或时段接口返回时存在（后端会省略空数组）。
	slots?: ScheduleSlot[];
}

// GET /schedule/plans 查询参数（规范 5.1）：除分页排序外均可选，日期为闭区间。
export interface PlanSearchParams {
	doctorId?: number;
	// departmentId 通过子科室关联过滤。
	departmentId?: number;
	subdepartmentId?: number;
	fromDate?: string;
	toDate?: string;
	includeSlots?: boolean;
	page?: number;
	pageSize?: number;
	sort?: PlanSortField;
	order?: SortOrder;
}

// POST /schedule/plans 请求体（规范 5.2）：maximum 为 1..32767，日期不得早于业务当日。
export interface CreatePlanRequest {
	doctorId: number;
	subdepartmentId: number;
	date: string;
	maximum: number;
}

// POST /schedule/plans/{planId}/slots 请求体（规范 5.5）：slot 与 maximum 均为 1..32767。
export interface CreateSlotRequest {
	slot: number;
	maximum: number;
}

// 规范 1.5：Idempotency-Key 为 1-128 个可打印 ASCII 字符。
// 在前端统一生成，使重复提交（双击、网络重试）返回同一次创建结果，而不是重复建资源。
export function createIdempotencyKey(prefix = "schedule"): string {
	const random =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
	return `${prefix}-${random}`.slice(0, 128);
}

// GET /api/v1/schedule/plans：分页查询出诊计划，默认 page=1、pageSize=20、sort=id、order=asc。
export function getSchedulePlans(
	params: PlanSearchParams = {},
): Promise<SchedulePagedResult<WorkPlan>> {
	const { page = 1, pageSize = 20, ...filters } = params;
	return ajax<SchedulePagedResult<WorkPlan>>({
		url: "/schedule/plans",
		method: "GET",
		data: { ...filters, page, pageSize },
	});
}

// 全量拉取的分批并发上限：与 src/api/doctors.ts 的 getAllDoctors 保持同一策略，
// 避免页数较多时一次性打出过多并发请求。
const PLAN_PAGE_BATCH_SIZE = 5;

// GET /api/v1/schedule/plans 全量拉取：先取第 1 页，再按响应回显的 pageSize 取完剩余页。
// 目的：规范 1.4 规定 pageSize 上限为 100，而 Dashboard 的统计必须覆盖窗口内的全部计划，
// 只取第 1 页会在计划数超过 100 时把计划数、号源与利用率整体算小。
// 说明：始终从第 1 页开始，params 中的 page 会被忽略。
export async function getAllSchedulePlans(
	params: PlanSearchParams = {},
): Promise<WorkPlan[]> {
	const first = await getSchedulePlans({ ...params, page: 1 });
	// 以响应回显的分页参数为准，避免请求参数被服务端调整后算错页数。
	const pageSize = first.pageSize > 0 ? first.pageSize : first.items.length;
	const totalPages = pageSize > 0 ? Math.ceil(first.total / pageSize) : 1;
	if (totalPages <= 1) return first.items;

	const items = [...first.items];
	for (let start = 2; start <= totalPages; start += PLAN_PAGE_BATCH_SIZE) {
		const batch = Array.from(
			{ length: Math.min(PLAN_PAGE_BATCH_SIZE, totalPages - start + 1) },
			(_, index) => getSchedulePlans({ ...params, page: start + index }),
		);
		const results = await Promise.all(batch);
		for (const result of results) items.push(...result.items);
	}
	return items;
}
// POST /api/v1/schedule/plans：创建出诊计划，成功返回 201 与资源对象。
// 409 SCHEDULE_PLAN_EXISTS 表示同一医生/子科室/日期已存在计划。
export function createSchedulePlan(
	body: CreatePlanRequest,
	idempotencyKey: string = createIdempotencyKey("plan-create"),
): Promise<WorkPlan> {
	return ajax<WorkPlan>({
		url: "/schedule/plans",
		method: "POST",
		data: body,
		idempotencyKey,
	});
}

// PATCH /api/v1/schedule/plans/{planId}：仅允许修改 maximum（规范 5.3）。
// 成功返回最新资源；409 SCHEDULE_CAPACITY_INVALID / SCHEDULE_PLAN_LOCKED / SCHEDULE_CONFLICT。
// 项目约定不做 If-Match：不发送 If-Match 头，仅依赖幂等键。
export function updateSchedulePlanMaximum(params: {
	planId: number;
	maximum: number;
	idempotencyKey?: string;
}): Promise<WorkPlan> {
	const { planId, maximum, idempotencyKey } = params;
	return ajax<WorkPlan>({
		url: `/schedule/plans/${planId}`,
		method: "PATCH",
		data: { maximum },
		idempotencyKey,
	});
}

// DELETE /api/v1/schedule/plans/{planId}：成功 204 无响应体。
// 已有挂号记录返回 409 SCHEDULE_HAS_REGISTRATIONS；已开始/已结束返回 409 SCHEDULE_PLAN_LOCKED。
export function deleteSchedulePlan(planId: number): Promise<void> {
	return ajax<void>({
		url: `/schedule/plans/${planId}`,
		method: "DELETE",
		idempotencyKey: createIdempotencyKey("plan-delete"),
	});
}

// GET /api/v1/schedule/plans/{planId}/slots：返回该计划的时段数组（按 slot 升序），非分页结构。
export function getSchedulePlanSlots(planId: number): Promise<ScheduleSlot[]> {
	return ajax<ScheduleSlot[]>({
		url: `/schedule/plans/${planId}/slots`,
		method: "GET",
	});
}

// POST /api/v1/schedule/plans/{planId}/slots：新增时段，成功 201。
// 同一计划下 slot 重复返回 409 SCHEDULE_SLOT_EXISTS。
export function createSchedulePlanSlot(
	planId: number,
	body: CreateSlotRequest,
	idempotencyKey: string = createIdempotencyKey("slot-create"),
): Promise<ScheduleSlot> {
	return ajax<ScheduleSlot>({
		url: `/schedule/plans/${planId}/slots`,
		method: "POST",
		data: body,
		idempotencyKey,
	});
}

// PATCH /api/v1/schedule/slots/{slotId}：仅允许修改 maximum（规范 5.5）。
// 409 SCHEDULE_CAPACITY_INVALID（小于已挂号数）/ SCHEDULE_SLOT_LOCKED（计划已开始或已有挂号）/
// SCHEDULE_CONFLICT（服务端并发冲突）。
// 项目约定不做 If-Match：不发送 If-Match 头，仅依赖幂等键。
export function updateScheduleSlotMaximum(params: {
	slotId: number;
	maximum: number;
	idempotencyKey?: string;
}): Promise<ScheduleSlot> {
	const { slotId, maximum, idempotencyKey } = params;
	return ajax<ScheduleSlot>({
		url: `/schedule/slots/${slotId}`,
		method: "PATCH",
		data: { maximum },
		idempotencyKey,
	});
}

// DELETE /api/v1/schedule/slots/{slotId}：成功 204 无响应体。
// 已有挂号记录返回 409 SCHEDULE_HAS_REGISTRATIONS（与 PATCH 的 SCHEDULE_SLOT_LOCKED 区分）。
export function deleteScheduleSlot(slotId: number): Promise<void> {
	return ajax<void>({
		url: `/schedule/slots/${slotId}`,
		method: "DELETE",
		idempotencyKey: createIdempotencyKey("slot-delete"),
	});
}

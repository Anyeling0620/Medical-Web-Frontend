// 接口规范 3：认证域 /api/v1/mis/auth（token 经 HttpOnly Cookie 传输，不落 localStorage）
import { ajax } from "../lib/api";

export interface AuthUser {
	id: number;
	username: string;
	name: string;
	departmentId: number | null;
	job: string | null;
	// 医生账号绑定的 doctor.id（后端取自 mis_user.ref_id，接口规范 §1.2/§6.10）；
	// 非医生账号为 null，前端据此展示医生工作台入口。
	doctorId: number | null;
}

// 登录/刷新成功响应（规范 3.1/3.2）
export interface AuthSession {
	user: AuthUser;
	permissions: string[];
	accessExpiresAt: string;
}

export interface LoginRequest {
	username: string;
	password: string;
}

// POST /api/v1/mis/auth/login：管理员登录，失败统一 401 AUTH_INVALID_CREDENTIALS
export function login(data: LoginRequest) {
	return ajax<AuthSession>({
		url: "/mis/auth/login",
		method: "POST",
		data,
	});
}

// POST /api/v1/mis/auth/refresh：HttpOnly Cookie 携带 refresh token 轮换
export function refresh() {
	return ajax<AuthSession>({
		url: "/mis/auth/refresh",
		method: "POST",
		data: {},
	});
}

// POST /api/v1/mis/auth/logout：撤销会话，成功 204
export function logout() {
	return ajax<void>({
		url: "/mis/auth/logout",
		method: "POST",
		data: {},
	});
}

// GET /api/v1/mis/auth/me：当前用户与实时权限（规范 3.4）
export type MeResponse = AuthUser & { permissions: string[] };

export function getMe() {
	return ajax<MeResponse>({
		url: "/mis/auth/me",
		method: "GET",
	});
}

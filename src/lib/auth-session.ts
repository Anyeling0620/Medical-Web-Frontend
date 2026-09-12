// 登录态判定与会话缓存（接口规范 3.2：POST /api/v1/mis/auth/refresh）。
// token 只由 HttpOnly Cookie 自动携带，前端不读取也不写入 localStorage。
// 约定：200 返回与 login 相同的登录响应体 => 已登录；401 AUTH_INVALID_REFRESH_TOKEN => 未登录。
import { type AuthSession, refresh } from "@/api/auth";
import { isApiError } from "@/lib/api-error";

// 校验结论缓存时长（毫秒）：短时间内多次导航复用同一次结论。
// refresh 会轮换 refresh token，每次导航都请求既浪费，也会放大并发轮换导致的误判。
const SESSION_CACHE_TTL_MS = 30_000;

interface SessionState {
	// session 为 null 表示已确认未登录；未登录结论同样缓存，避免 / -> /login 跳转链重复请求。
	session: AuthSession | null;
	expiresAt: number;
}

// 最近一次校验结论：登录成功、校验失败或退出登录时立即覆盖。
let sessionState: SessionState | null = null;
// 结论写入版本号：每次写入自增，用于丢弃「发起更早、返回更晚」的过期校验结果。
let stateVersion = 0;
// 同一时刻只保留一个在途校验请求：并发 refresh 会因旧 token 已被轮换撤销而误判为未登录。
let pendingSession: Promise<void> | null = null;

// 写入 Header/Sidebar 展示用的用户信息（键名与登录成功后的处理保持一致）。
function storeSessionUser(session: AuthSession) {
	if (typeof window === "undefined") return;

	localStorage.setItem("username", JSON.stringify(session.user.username));
	localStorage.setItem(
		"permissions",
		JSON.stringify(session.permissions[0] ?? ""),
	);
	// 完整权限列表用于侧边栏菜单可见性判定（permissions 只保留首个权限用于展示）。
	localStorage.setItem("permissionList", JSON.stringify(session.permissions));
	// 医生编号（mis_user.ref_id -> doctor.id，契约 §6.10）：非医生账号为 null，
	// 侧边栏据此展示「我的患者」入口。
	localStorage.setItem(
		"doctorId",
		JSON.stringify(session.user.doctorId ?? null),
	);
}

// 清除 Header/Sidebar 展示用的用户信息。
function clearStoredUser() {
	if (typeof window === "undefined") return;

	localStorage.removeItem("username");
	localStorage.removeItem("permissions");
	localStorage.removeItem("permissionList");
	localStorage.removeItem("doctorId");
}

// 登录成功后记录会话，随后访问受保护路由无需再请求 refresh。
export function setSession(session: AuthSession) {
	stateVersion += 1;
	sessionState = { session, expiresAt: Date.now() + SESSION_CACHE_TTL_MS };
	storeSessionUser(session);
}

// 清空会话缓存与展示用数据。注意：接入退出登录时必须调用本函数，
// 否则内存中缓存的已登录结论会让用户继续进入受保护页面（最长 30 秒）。
export function clearSession() {
	stateVersion += 1;
	sessionState = null;
	clearStoredUser();
}

// 记录未登录结论：清空展示用数据，并缓存结论避免短时间内重复请求 refresh。
function setUnauthenticated() {
	stateVersion += 1;
	sessionState = {
		session: null,
		expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
	};
	clearStoredUser();
}

// 真实发起一次 refresh 校验：只有 200 才视为已登录。
async function requestSession(): Promise<void> {
	const version = stateVersion;

	try {
		const session = await refresh();
		// 请求期间若已写入更新的结论（例如用户刚登录成功），丢弃本次结果，避免覆盖。
		if (stateVersion === version) setSession(session);
	} catch (error) {
		if (stateVersion !== version) return;

		if (isApiError(error) && error.status === 401) {
			// 401（刷新令牌无效或已过期）是「确定未登录」：缓存结论，避免跳转链重复请求。
			setUnauthenticated();
		} else {
			// 网络异常、5xx 等无法确认登录态：按未登录处理以免渲染受保护页面，
			// 但不缓存结论，下一次访问会重新校验，避免后端瞬时抖动导致 30 秒内无法恢复。
			clearSession();
		}
	}
}

// 校验登录态：命中缓存或已有在途请求时直接复用，否则发起一次 refresh。
export async function checkAuthSession(): Promise<AuthSession | null> {
	if (sessionState && sessionState.expiresAt > Date.now()) {
		return sessionState.session;
	}

	if (!pendingSession) {
		pendingSession = requestSession().finally(() => {
			pendingSession = null;
		});
	}

	await pendingSession;

	// 以最新结论为准：校验期间用户可能已登录成功或已退出登录。
	return sessionState?.session ?? null;
}

// 路由守卫统一入口：按目标路径判断是否需要跳转，路由 beforeLoad 与根组件的水合兜底共用本函数。
// 服务端渲染阶段读取不到浏览器 Cookie，返回 null 表示不跳转，交给浏览器端判定。
export async function checkRouteGuard(
	pathname: string,
): Promise<"/dashboard" | "/login" | null> {
	if (typeof window === "undefined") return null;

	// TanStack Router 默认大小写不敏感，统一转小写，避免 /Dashboard、/Login 等变体绕过守卫。
	const path = pathname.toLowerCase();

	const session = await checkAuthSession();

	// 根路径只做分流：已登录 => /dashboard，未登录 => /login。
	if (path === "/") return session ? "/dashboard" : "/login";

	// 已登录访问 /login => /dashboard；未登录时停留在登录页。
	if (path === "/login" || path.startsWith("/login/")) {
		return session ? "/dashboard" : null;
	}

	// 未登录访问 /dashboard 及其子路由 => /login；已登录时放行。
	if (path === "/dashboard" || path.startsWith("/dashboard/")) {
		return session ? null : "/login";
	}

	return null;
}

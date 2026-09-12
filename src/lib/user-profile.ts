// 用户个性化信息（昵称 + 头像）的本地存储模型与校验规则。
//
// 本模块刻意保持零运行时依赖（只有类型声明与纯函数），
// 这样可以用 `node --test src/lib/user-profile.test.ts` 直接验证解析与校验规则，
// 与 src/lib/navigation-menu.ts、src/lib/dashboard-metrics.ts 的测试方式一致；
// 需要 React 的水合读取与变更订阅见 src/lib/use-user-profile.ts。

// localStorage 键前缀：完整键为 `userProfile:<账号名>`。
// 账号名只去掉首尾空格、保留大小写（后端按 username 精确匹配，见 normalizeUsername 的说明）。
export const USER_PROFILE_KEY_PREFIX = "userProfile:";

// 个性化信息变更事件名。
// Header / Sidebar 与设置页是并列挂载的组件（父级布局路由不会随子路由重挂载），
// 保存后必须主动通知它们重新读取，否则要刷新整页才能看到新头像与新名称。
export const USER_PROFILE_CHANGED_EVENT = "medical:user-profile-changed";

// 头像原图大小上限（5MB）：先在前端拦掉超大文件，再做压缩，
// 避免把超大 base64 写入 localStorage 时触发配额错误。
export const MAX_AVATAR_SOURCE_BYTES = 5 * 1024 * 1024;

// 头像压缩后的最长边（像素）。256 在 Header / Sidebar 的圆形头像上足够清晰，
// 同时把 base64 体积控制在几十 KB 量级，避免撑爆 localStorage（常见配额约 5MB）。
export const AVATAR_MAX_EDGE = 256;

// 昵称长度上限，与登录接口用户名的长度上限（20 字符）保持一致。
export const MAX_DISPLAY_NAME_LENGTH = 20;

// 允许的头像格式：都是浏览器可直接解码的位图。
// 不接受 SVG：SVG 可以内嵌脚本，作为头像展示没有必要承担这类风险。
export const ALLOWED_AVATAR_MIME_TYPES: readonly string[] = [
	"image/png",
	"image/jpeg",
	"image/webp",
];

// 不可见格式字符（Unicode Cf 类别，如零宽空格 U+200B、双向覆盖符 U+202E）：
// 昵称里出现这类字符会展示成乱码或被用来伪造名称，校验时一并拦截。
const INVISIBLE_FORMAT_PATTERN = /\p{Cf}/u;

export interface UserProfile {
	// 自定义昵称；空串表示未设置，展示时回落到登录账号名。
	displayName: string;
	// 头像的 base64 内联地址；空串表示未设置，展示时回落到项目默认图标 src/static/doctor.png。
	avatarDataUrl: string;
}

// 未设置任何个性化信息时的默认值。
export const EMPTY_USER_PROFILE: UserProfile = {
	displayName: "",
	avatarDataUrl: "",
};

// 账号名归一化：只去掉首尾空格。
// 不能做小写归一化：账号名取自登录响应的规范值，后端按 username 精确匹配
// （PostgreSQL hospital.mis_user，默认大小写敏感），
// 若把 Admin / admin 折叠成同一个键，两个真实账号会共用一份头像与名称。
export function normalizeUsername(username: string): string {
	return username.trim();
}

// 计算某个账号的存储键；账号名归一化后为空（例如水合完成前的空串）时返回空串，
// 调用方据此跳过读写，避免所有未登录用户共用同一个 `userProfile:` 键。
export function profileStorageKey(username: string): string {
	const normalized = normalizeUsername(username);
	if (normalized === "") return "";
	return `${USER_PROFILE_KEY_PREFIX}${normalized}`;
}

// 判断是否为内联 base64 图片：项目自身只写入这种值，
// 拒绝外部 URL 可以避免展示头像时向第三方发起请求。
// MIME 必须与允许的头像格式一致：否则 data:text/html;base64,... 之类的值
// 也会被当成合法头像写进本地存储（虽然 <img> 不会执行它，但没有放行的必要）。
function isInlineImageUrl(value: string): boolean {
	if (!value.startsWith("data:")) return false;

	const separatorIndex = value.indexOf(";base64,");
	if (separatorIndex === -1) return false;

	const mimeType = value.slice("data:".length, separatorIndex);
	return ALLOWED_AVATAR_MIME_TYPES.includes(mimeType);
}

// 按码点截断昵称：超长时保留前面的字符。
// 输入框与存储解析都复用它，避免按 UTF-16 长度截断把 emoji 切成半个代理对（显示成乱码）。
export function truncateDisplayName(value: string): string {
	const characters = Array.from(value);
	if (characters.length <= MAX_DISPLAY_NAME_LENGTH) return value;
	return characters.slice(0, MAX_DISPLAY_NAME_LENGTH).join("");
}

// 解析 localStorage 里的原始字符串：任何脏数据（非 JSON、非对象、字段类型不符）
// 一律按默认值处理，保证头像与名称的展示不会因历史数据而崩溃。
export function parseUserProfile(raw: string | null | undefined): UserProfile {
	if (!raw) return { ...EMPTY_USER_PROFILE };

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ...EMPTY_USER_PROFILE };
	}
	if (typeof parsed !== "object" || parsed === null) {
		return { ...EMPTY_USER_PROFILE };
	}

	const record = parsed as Record<string, unknown>;
	const displayName =
		typeof record.displayName === "string" ? record.displayName.trim() : "";
	const avatarDataUrl =
		typeof record.avatarDataUrl === "string" ? record.avatarDataUrl.trim() : "";

	return {
		// 昵称超长（历史数据或用户手工改过 localStorage）时截断，避免撑坏布局。
		displayName: truncateDisplayName(displayName),
		// 只接受内联图片，其余（含外部 URL、脚本片段）一律按未设置处理。
		avatarDataUrl: isInlineImageUrl(avatarDataUrl) ? avatarDataUrl : "",
	};
}

// 读取某个账号的个性化信息。服务端渲染与首次水合时都返回默认值
// （无 window 或账号名为空），由调用方在水合完成后再读取，避免 SSR 报错与 hydration 不一致。
export function readStoredUserProfile(username: string): UserProfile {
	if (typeof window === "undefined") return { ...EMPTY_USER_PROFILE };

	const key = profileStorageKey(username);
	if (key === "") return { ...EMPTY_USER_PROFILE };

	try {
		return parseUserProfile(window.localStorage.getItem(key));
	} catch {
		// 隐私模式等场景下读取也会抛错，按未设置处理。
		return { ...EMPTY_USER_PROFILE };
	}
}

// 写入某个账号的个性化信息；内容为空时删除整条记录（登录账号名本身不作为存储内容）。
// 返回是否写入成功：隐私模式或配额不足时 localStorage 会抛错，调用方需要据此提示用户。
export function writeStoredUserProfile(
	username: string,
	profile: UserProfile,
): boolean {
	if (typeof window === "undefined") return false;

	const key = profileStorageKey(username);
	if (key === "") return false;

	const normalized = parseUserProfile(JSON.stringify(profile));

	try {
		if (normalized.displayName === "" && normalized.avatarDataUrl === "") {
			window.localStorage.removeItem(key);
		} else {
			window.localStorage.setItem(key, JSON.stringify(normalized));
		}
	} catch {
		return false;
	}

	notifyUserProfileChanged();
	return true;
}

// 清除某个账号的个性化信息（设置页「恢复默认」使用）。
export function clearStoredUserProfile(username: string): boolean {
	return writeStoredUserProfile(username, EMPTY_USER_PROFILE);
}

// 通知正在监听个性化信息的组件重新读取（仅当前标签页；跨标签页由 storage 事件覆盖）。
function notifyUserProfileChanged(): void {
	window.dispatchEvent(new Event(USER_PROFILE_CHANGED_EVENT));
}

// 解析最终展示的名称：优先自定义昵称，其次登录账号名；都为空时返回空串，由调用方兜底文案。
export function resolveDisplayName(
	profileName: string,
	username: string,
): string {
	const customName = profileName.trim();
	if (customName !== "") return customName;
	return username.trim();
}

// 校验设置页提交的名称，返回面向用户的错误文案；返回 null 表示校验通过。
// 空值表示「使用登录账号名」（由 resolveDisplayName 兜底），因此不算错误。
export function validateDisplayName(value: string): string | null {
	const trimmed = value.trim();

	const characters = Array.from(trimmed);
	if (characters.length > MAX_DISPLAY_NAME_LENGTH) {
		return `名称不能超过 ${MAX_DISPLAY_NAME_LENGTH} 个字符`;
	}

	// 控制字符（含换行）与不可见格式字符会被写进 localStorage 并在各处展示，
	// 可能显示成乱码或被用来伪造名称，统一拦掉。
	const hasUnsafeCharacter = characters.some((character) => {
		const code = character.codePointAt(0) ?? 0;
		if (code < 0x20 || code === 0x7f) return true;
		return INVISIBLE_FORMAT_PATTERN.test(character);
	});
	if (hasUnsafeCharacter) return "名称不能包含换行、控制字符或不可见字符";

	return null;
}

// 校验用户选择的头像原图，返回面向用户的错误文案；返回 null 表示校验通过。
// 入参只要求 type 与 size，测试时可以传普通对象，无需构造真实 File。
export function validateAvatarFile(file: {
	type: string;
	size: number;
}): string | null {
	if (file.size <= 0) return "头像文件为空，请重新选择";
	if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type)) {
		return "仅支持 PNG、JPG、WebP 格式的图片";
	}
	if (file.size > MAX_AVATAR_SOURCE_BYTES) {
		return `头像图片不能超过 ${MAX_AVATAR_SOURCE_BYTES / (1024 * 1024)}MB`;
	}
	return null;
}

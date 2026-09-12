// 用户个性化信息（昵称 + 头像）本地存储与校验规则的单元测试，使用 Node 内置测试运行器
// （node --test），不引入任何依赖。
// 运行命令：node --test src/lib/user-profile.test.ts
// 之所以能直接运行 .ts：user-profile.ts 只包含类型声明与纯函数，运行时不加载任何模块，
// 可被 Node 的类型擦除直接加载；相对导入必须带 .ts 扩展名（与 navigation-menu.test.ts 一致）。
// 直接运行 .ts 需要 Node ≥ 22.18 / ≥ 23.6（内置类型擦除默认生效），本仓库实测使用 Node v24.18.0。
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
	ALLOWED_AVATAR_MIME_TYPES,
	clearStoredUserProfile,
	EMPTY_USER_PROFILE,
	MAX_AVATAR_SOURCE_BYTES,
	MAX_DISPLAY_NAME_LENGTH,
	parseUserProfile,
	profileStorageKey,
	readStoredUserProfile,
	resolveDisplayName,
	truncateDisplayName,
	USER_PROFILE_CHANGED_EVENT,
	USER_PROFILE_KEY_PREFIX,
	validateAvatarFile,
	validateDisplayName,
	writeStoredUserProfile,
} from "./user-profile.ts";

// 合法头像测试数据：只接受内联 base64 图片，这里用一段最小 PNG 的 data URL。
const AVATAR_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wD/AL0AAAAASUVORK5CYII=";

// 构造假 window 的选项：用于模拟隐私模式 / 配额不足等 localStorage 抛错的场景。
interface FakeWindowOptions {
	// 模拟写入抛错（localStorage 配额不足、隐私模式）。
	failOnSetItem?: boolean;
	// 模拟读取抛错（隐私模式下部分浏览器会抛错）。
	failOnGetItem?: boolean;
	// 模拟删除抛错：用于覆盖 clearStoredUserProfile 的失败分支。
	failOnRemoveItem?: boolean;
}

interface FakeWindow {
	window: Window;
	// 底层键值存储：便于断言「写入空内容时删除键」以及账号之间的键隔离。
	items: Map<string, string>;
	// 记录派发过的事件类型：便于断言变更通知是否发出。
	events: string[];
}

// 只实现被测代码用到的成员（localStorage 的三个方法与 dispatchEvent），
// 因此无需引入 jsdom 之类的 DOM 环境依赖。
function createFakeWindow(options: FakeWindowOptions = {}): FakeWindow {
	const items = new Map<string, string>();
	const events: string[] = [];

	const windowLike = {
		localStorage: {
			getItem(key: string): string | null {
				if (options.failOnGetItem) throw new Error("SecurityError");
				return items.get(key) ?? null;
			},
			setItem(key: string, value: string): void {
				if (options.failOnSetItem) throw new Error("QuotaExceededError");
				items.set(key, value);
			},
			removeItem(key: string): void {
				if (options.failOnRemoveItem) throw new Error("SecurityError");
				items.delete(key);
			},
		},
		dispatchEvent(event: Event): boolean {
			events.push(event.type);
			return true;
		},
	};

	return { window: windowLike as unknown as Window, items, events };
}

// 测试运行环境（Node）本身没有 window，这里先记住初始状态，测试结束后原样恢复。
const ORIGINAL_WINDOW = (globalThis as { window?: unknown }).window;

// 把假 window 挂到 globalThis 上：被测代码通过 typeof window 判定运行环境。
function setGlobalWindow(value: unknown): void {
	(globalThis as { window?: unknown }).window = value;
}

// 每个用例结束后清理全局状态，避免假 window 泄漏到后续用例。
afterEach(() => {
	setGlobalWindow(ORIGINAL_WINDOW);
});

describe("profileStorageKey", () => {
	test("账号名只去掉首尾空格，不做大小写归一化", () => {
		assert.strictEqual(
			profileStorageKey("  Doctor_A  "),
			`${USER_PROFILE_KEY_PREFIX}Doctor_A`,
		);
		assert.strictEqual(
			profileStorageKey("ROOT  "),
			`${USER_PROFILE_KEY_PREFIX}ROOT`,
		);
		// 首尾空格必须裁掉：同一账号多敲空格不能变成另一个键。
		assert.strictEqual(
			profileStorageKey("Doctor_A"),
			profileStorageKey("  Doctor_A  "),
		);
		// 大小写必须保留：账号名取自登录响应的规范值，后端 PostgreSQL hospital.mis_user
		// 按 username = $1 精确匹配（默认大小写敏感），因此「Admin」与「admin」是两个不同账号，
		// 折叠成同一个键会让两个真实账号共用一份头像与名称。
		assert.strictEqual(
			profileStorageKey("Admin"),
			`${USER_PROFILE_KEY_PREFIX}Admin`,
		);
		assert.strictEqual(
			profileStorageKey("admin"),
			`${USER_PROFILE_KEY_PREFIX}admin`,
		);
		assert.notStrictEqual(
			profileStorageKey("Admin"),
			profileStorageKey("admin"),
		);
	});

	test("账号名为空或仅空格时返回空串", () => {
		// 未登录 / 水合未完成时账号名为空，返回空串让调用方跳过读写，
		// 避免所有匿名访客共用同一个 `userProfile:` 键。
		assert.strictEqual(profileStorageKey(""), "");
		assert.strictEqual(profileStorageKey("   "), "");
	});
});

describe("parseUserProfile", () => {
	test("空值、非法 JSON、非对象 JSON 一律回落为默认值", () => {
		const dirtyValues: Array<string | null | undefined> = [
			null,
			undefined,
			"",
			"   ",
			"not json",
			"{",
			"123",
			"true",
			"null",
			"[1,2]",
		];
		for (const raw of dirtyValues) {
			assert.deepStrictEqual(
				parseUserProfile(raw),
				EMPTY_USER_PROFILE,
				`脏数据 ${String(raw)} 应回落为默认值`,
			);
		}
	});

	test("字段类型不对时按未设置处理", () => {
		const wrongTypes = [
			"{}",
			JSON.stringify({ displayName: 123, avatarDataUrl: [] }),
			JSON.stringify({ displayName: null, avatarDataUrl: null }),
			JSON.stringify({ displayName: true, avatarDataUrl: 0 }),
		];
		for (const raw of wrongTypes) {
			assert.deepStrictEqual(
				parseUserProfile(raw),
				EMPTY_USER_PROFILE,
				`字段类型不符的 ${raw} 应回落为默认值`,
			);
		}
	});

	test("昵称与头像地址的首尾空格会被裁剪", () => {
		assert.deepStrictEqual(
			parseUserProfile(
				JSON.stringify({
					displayName: "  张三  ",
					avatarDataUrl: `  ${AVATAR_DATA_URL}  `,
				}),
			),
			{ displayName: "张三", avatarDataUrl: AVATAR_DATA_URL },
		);
	});

	test("昵称超过上限时按码点截断到 MAX_DISPLAY_NAME_LENGTH", () => {
		// 用 4 字节的 emoji 验证按「码点」而非 UTF-16 长度截断：
		// 若按 UTF-16 截断，会切出半个代理对，展示成乱码。
		const longName = "😀".repeat(MAX_DISPLAY_NAME_LENGTH + 5);
		const parsed = parseUserProfile(
			JSON.stringify({ displayName: longName, avatarDataUrl: "" }),
		);

		assert.strictEqual(
			Array.from(parsed.displayName).length,
			MAX_DISPLAY_NAME_LENGTH,
		);
		assert.strictEqual(
			parsed.displayName,
			"😀".repeat(MAX_DISPLAY_NAME_LENGTH),
		);
		// 截断结果保留完整代理对：UTF-16 长度应为码点数的两倍。
		assert.strictEqual(parsed.displayName.length, MAX_DISPLAY_NAME_LENGTH * 2);
	});

	test("头像不是内联 base64 图片时回落为空串", () => {
		const invalidAvatars = [
			"   ",
			"javascript:alert(1)",
			"data:image/png,abc",
			["da", "ta:", "image/gif;base64,R0lGODlhAQABAAAAACw="].join(""),
			"blob:http://localhost/9a1b",
		];
		for (const avatarDataUrl of invalidAvatars) {
			assert.strictEqual(
				parseUserProfile(JSON.stringify({ displayName: "张三", avatarDataUrl }))
					.avatarDataUrl,
				"",
				`非内联图片的 ${avatarDataUrl} 应按未设置处理`,
			);
		}
		// 合法内联图片原样保留，避免上面的断言写成恒真。
		assert.strictEqual(
			parseUserProfile(
				JSON.stringify({ displayName: "张三", avatarDataUrl: AVATAR_DATA_URL }),
			).avatarDataUrl,
			AVATAR_DATA_URL,
		);
	});

	test("头像按 MIME 白名单判定：非白名单 data URL 一律回落为空串", () => {
		// 内联地址用「data:」+ MIME +「;base64,」+ 内容拼出来（拆成多段，避免整段地址被工具改写）。
		const inlineAvatar = (mimeType: string, payload: string): string =>
			["da", "ta:", mimeType, ";base64,", payload].join("");

		const invalidAvatars = [
			inlineAvatar("text/html", "PHNjcmlwdD4="),
			inlineAvatar("image/svg+xml", "PHN2Zz48L3N2Zz4="),
			inlineAvatar("application/octet-stream", "AAAA"),
			// 缺少「;base64,」分隔符的地址同样不算内联图片。
			["da", "ta:", "image/png,notbase64"].join(""),
		];
		for (const avatarDataUrl of invalidAvatars) {
			assert.strictEqual(
				parseUserProfile(JSON.stringify({ displayName: "张三", avatarDataUrl }))
					.avatarDataUrl,
				"",
				`非白名单 MIME 的 ${avatarDataUrl} 应按未设置处理`,
			);
		}

		// 白名单内的 PNG / JPEG / WebP 内联值必须原样保留。
		const allowedAvatars = [
			inlineAvatar("image/png", "iVBORw0KGgo="),
			inlineAvatar("image/jpeg", "/9j/4AAQSkZJRg=="),
			inlineAvatar("image/webp", "UklGRhIAAABXRUJQ"),
		];
		for (const avatarDataUrl of allowedAvatars) {
			assert.strictEqual(
				parseUserProfile(JSON.stringify({ displayName: "张三", avatarDataUrl }))
					.avatarDataUrl,
				avatarDataUrl,
			);
		}
	});
});

describe("读写与账号隔离", () => {
	test("两个账号各存各的，互不影响", () => {
		const fake = createFakeWindow();
		setGlobalWindow(fake.window);

		assert.strictEqual(
			writeStoredUserProfile("Doctor_A", {
				displayName: "医生甲",
				avatarDataUrl: AVATAR_DATA_URL,
			}),
			true,
		);
		assert.strictEqual(
			writeStoredUserProfile("doctor_b", {
				displayName: "医生乙",
				avatarDataUrl: "",
			}),
			true,
		);

		// 各自读到自己写的内容。
		assert.deepStrictEqual(readStoredUserProfile("Doctor_A"), {
			displayName: "医生甲",
			avatarDataUrl: AVATAR_DATA_URL,
		});
		assert.deepStrictEqual(readStoredUserProfile("doctor_b"), {
			displayName: "医生乙",
			avatarDataUrl: "",
		});
		// 首尾空格不影响命中：多敲空格仍读到同一份数据。
		assert.deepStrictEqual(
			readStoredUserProfile("  Doctor_A  "),
			readStoredUserProfile("Doctor_A"),
		);
		// 大小写不同的账号互相隔离：doctor_a 与 Doctor_A 是后端两个账号，不能共用数据。
		assert.deepStrictEqual(
			readStoredUserProfile("doctor_a"),
			EMPTY_USER_PROFILE,
		);
		// 底层键名：前缀 + 去掉首尾空格后的账号名（保留大小写），两个账号各占一个键。
		assert.deepStrictEqual([...fake.items.keys()].sort(), [
			`${USER_PROFILE_KEY_PREFIX}Doctor_A`,
			`${USER_PROFILE_KEY_PREFIX}doctor_b`,
		]);
		// 从未设置过的账号读到默认值，不会串到别人的头像与名称。
		assert.deepStrictEqual(
			readStoredUserProfile("doctor_c"),
			EMPTY_USER_PROFILE,
		);
	});

	test("写入空内容时删除整条记录", () => {
		const fake = createFakeWindow();
		setGlobalWindow(fake.window);

		writeStoredUserProfile("doctor_a", {
			displayName: "医生甲",
			avatarDataUrl: AVATAR_DATA_URL,
		});
		assert.strictEqual(
			fake.items.has(`${USER_PROFILE_KEY_PREFIX}doctor_a`),
			true,
		);

		// 仅空格的昵称会被裁剪成空串，等价于「恢复默认」，应删除整条记录而不是写入空对象。
		assert.strictEqual(
			writeStoredUserProfile("doctor_a", {
				displayName: "   ",
				avatarDataUrl: "   ",
			}),
			true,
		);
		assert.strictEqual(
			fake.items.has(`${USER_PROFILE_KEY_PREFIX}doctor_a`),
			false,
		);
		assert.deepStrictEqual(
			readStoredUserProfile("doctor_a"),
			EMPTY_USER_PROFILE,
		);

		// clearStoredUserProfile 是「恢复默认」入口，效果同样是删除记录。
		writeStoredUserProfile("doctor_a", {
			displayName: "医生甲",
			avatarDataUrl: "",
		});
		assert.strictEqual(clearStoredUserProfile("doctor_a"), true);
		assert.strictEqual(
			fake.items.has(`${USER_PROFILE_KEY_PREFIX}doctor_a`),
			false,
		);
	});

	test("账号名为空时不读不写，也不派发事件", () => {
		const fake = createFakeWindow();
		setGlobalWindow(fake.window);
		fake.items.set("doctor_a", "{}");

		// 空账号名无法定位存储键，直接按默认值 / 写入失败处理。
		assert.deepStrictEqual(readStoredUserProfile("   "), EMPTY_USER_PROFILE);
		assert.strictEqual(
			writeStoredUserProfile("   ", {
				displayName: "医生甲",
				avatarDataUrl: "",
			}),
			false,
		);
		assert.strictEqual(clearStoredUserProfile(""), false);
		assert.deepStrictEqual(fake.events, []);
		assert.deepStrictEqual([...fake.items.keys()], ["doctor_a"]);
	});

	test("localStorage 抛错（配额 / 隐私模式）时返回 false 且不派发事件", () => {
		const fake = createFakeWindow({ failOnSetItem: true });
		setGlobalWindow(fake.window);

		assert.strictEqual(
			writeStoredUserProfile("doctor_a", {
				displayName: "医生甲",
				avatarDataUrl: AVATAR_DATA_URL,
			}),
			false,
		);
		// 写入失败时不能发出「已变更」通知，否则各组件会读到旧值。
		assert.deepStrictEqual(fake.events, []);
		assert.strictEqual(fake.items.size, 0);
	});

	test("删除记录抛错时 clearStoredUserProfile 返回 false 且不派发事件", () => {
		const fake = createFakeWindow({ failOnRemoveItem: true });
		setGlobalWindow(fake.window);
		const key = `${USER_PROFILE_KEY_PREFIX}doctor_a`;
		fake.items.set(key, "{}");

		assert.strictEqual(clearStoredUserProfile("doctor_a"), false);
		// 删除失败时既不能谎报成功，也不能发出「已恢复默认」通知。
		assert.strictEqual(fake.items.has(key), true);
		assert.deepStrictEqual(fake.events, []);
	});

	test("读取抛错时返回默认值", () => {
		const fake = createFakeWindow({ failOnGetItem: true });
		setGlobalWindow(fake.window);

		assert.deepStrictEqual(
			readStoredUserProfile("doctor_a"),
			EMPTY_USER_PROFILE,
		);
	});

	test("写入成功时派发 USER_PROFILE_CHANGED_EVENT 通知其它组件刷新", () => {
		const fake = createFakeWindow();
		setGlobalWindow(fake.window);

		writeStoredUserProfile("doctor_a", {
			displayName: "医生甲",
			avatarDataUrl: "",
		});
		assert.deepStrictEqual(fake.events, [USER_PROFILE_CHANGED_EVENT]);

		// 「恢复默认」同样要通知：否则页头与侧边栏会继续展示旧头像。
		clearStoredUserProfile("doctor_a");
		assert.deepStrictEqual(fake.events, [
			USER_PROFILE_CHANGED_EVENT,
			USER_PROFILE_CHANGED_EVENT,
		]);
	});

	test("无 window（服务端渲染）时读取返回默认值、写入返回 false", () => {
		// 删除 globalThis.window 以模拟没有 DOM 的 SSR 环境。
		delete (globalThis as { window?: unknown }).window;
		assert.strictEqual(typeof globalThis.window, "undefined");

		assert.deepStrictEqual(
			readStoredUserProfile("doctor_a"),
			EMPTY_USER_PROFILE,
		);
		assert.strictEqual(
			writeStoredUserProfile("doctor_a", {
				displayName: "医生甲",
				avatarDataUrl: AVATAR_DATA_URL,
			}),
			false,
		);
		assert.strictEqual(clearStoredUserProfile("doctor_a"), false);
	});
});

describe("truncateDisplayName", () => {
	test("长度未超过上限时原样返回", () => {
		const values = ["", "张三", "a".repeat(MAX_DISPLAY_NAME_LENGTH - 1)];
		for (const value of values) {
			assert.strictEqual(truncateDisplayName(value), value, value);
		}
	});

	test("恰好等于上限时原样返回（不误删末尾字符）", () => {
		const asciiName = "a".repeat(MAX_DISPLAY_NAME_LENGTH);
		const emojiName = "😀".repeat(MAX_DISPLAY_NAME_LENGTH);
		assert.strictEqual(truncateDisplayName(asciiName), asciiName);
		assert.strictEqual(truncateDisplayName(emojiName), emojiName);
	});

	test("超过上限时按码点截断，且不会切出半个代理对", () => {
		// emoji 在 UTF-16 中占 2 个单元，按 UTF-16 截断会切出半个代理对（展示成乱码）。
		const longName = "😀".repeat(MAX_DISPLAY_NAME_LENGTH + 5);
		const truncated = truncateDisplayName(longName);

		assert.strictEqual(Array.from(truncated).length, MAX_DISPLAY_NAME_LENGTH);
		assert.strictEqual(truncated, "😀".repeat(MAX_DISPLAY_NAME_LENGTH));
		// 完整代理对：UTF-16 长度应为码点数的两倍。
		assert.strictEqual(truncated.length, MAX_DISPLAY_NAME_LENGTH * 2);
		// 截断只删尾部，前缀必须与原值一致。
		assert.strictEqual(longName.startsWith(truncated), true);
	});

	test("parseUserProfile 复用了同一套截断规则", () => {
		const longName = "😀".repeat(MAX_DISPLAY_NAME_LENGTH + 5);
		const parsed = parseUserProfile(
			JSON.stringify({ displayName: longName, avatarDataUrl: "" }),
		);
		assert.strictEqual(parsed.displayName, truncateDisplayName(longName));
	});
});

describe("validateDisplayName", () => {
	test("空值与仅空格合法：表示沿用登录账号名，由 resolveDisplayName 兜底", () => {
		for (const value of ["", "   ", "\t\n"]) {
			assert.strictEqual(
				validateDisplayName(value),
				null,
				JSON.stringify(value),
			);
		}
	});

	test("超过 MAX_DISPLAY_NAME_LENGTH 个字符报错（按码点计数）", () => {
		assert.strictEqual(
			validateDisplayName("a".repeat(MAX_DISPLAY_NAME_LENGTH)),
			null,
		);
		assert.strictEqual(
			validateDisplayName("a".repeat(MAX_DISPLAY_NAME_LENGTH + 1)),
			`名称不能超过 ${MAX_DISPLAY_NAME_LENGTH} 个字符`,
		);
		// emoji 算一个字符：UTF-16 长度 40 也应在上限内。
		assert.strictEqual(
			validateDisplayName("😀".repeat(MAX_DISPLAY_NAME_LENGTH)),
			null,
		);
		assert.strictEqual(
			validateDisplayName("😀".repeat(MAX_DISPLAY_NAME_LENGTH + 1)),
			`名称不能超过 ${MAX_DISPLAY_NAME_LENGTH} 个字符`,
		);
	});

	test("含换行或控制字符时报错", () => {
		// 注意：首尾的换行会被 trim 掉（等价于用户多敲了回车），这里验证的是
		// 名称「内部」含换行或控制字符的情况。
		const invalidValues = ["张三\n李四", "张三\r\n李四", "a\u0000b", "\u007f"];
		for (const value of invalidValues) {
			assert.strictEqual(
				validateDisplayName(value),
				"名称不能包含换行、控制字符或不可见字符",
				JSON.stringify(value),
			);
		}
	});

	test("含不可见格式字符（零宽空格、双向覆盖符）时报错", () => {
		// 这类字符肉眼不可见，却能被用来伪造或撑乱名称展示，统一按非法处理。
		const invalidValues = ["\u200b", "张\u200b三", "\u202e", "张\u202e三"];
		for (const value of invalidValues) {
			assert.strictEqual(
				validateDisplayName(value),
				"名称不能包含换行、控制字符或不可见字符",
				JSON.stringify(value),
			);
		}
	});

	test("正常名称校验通过", () => {
		for (const value of ["张三", "  李四  ", "Dr. Who 123", "😀", "医生😀甲"]) {
			assert.strictEqual(validateDisplayName(value), null, value);
		}
	});
});

describe("validateAvatarFile", () => {
	test("文件为空（size 为 0 或负数）时报错", () => {
		for (const size of [0, -1]) {
			assert.strictEqual(
				validateAvatarFile({ type: "image/png", size }),
				"头像文件为空，请重新选择",
			);
		}
	});

	test("MIME 不在允许列表内时报错", () => {
		for (const type of ["image/gif", "image/svg+xml", "text/html", ""]) {
			assert.strictEqual(
				validateAvatarFile({ type, size: 1024 }),
				"仅支持 PNG、JPG、WebP 格式的图片",
				type,
			);
		}
	});

	test("允许的格式恰好是 PNG / JPEG / WebP（不含可内嵌脚本的 SVG）", () => {
		assert.deepStrictEqual(
			[...ALLOWED_AVATAR_MIME_TYPES],
			["image/png", "image/jpeg", "image/webp"],
		);
	});

	test("超过 MAX_AVATAR_SOURCE_BYTES 时报错，恰好等于上限时通过", () => {
		assert.strictEqual(
			validateAvatarFile({
				type: "image/png",
				size: MAX_AVATAR_SOURCE_BYTES + 1,
			}),
			`头像图片不能超过 ${MAX_AVATAR_SOURCE_BYTES / (1024 * 1024)}MB`,
		);
		assert.strictEqual(
			validateAvatarFile({ type: "image/png", size: MAX_AVATAR_SOURCE_BYTES }),
			null,
		);
	});

	test("合法图片校验通过", () => {
		for (const type of ALLOWED_AVATAR_MIME_TYPES) {
			assert.strictEqual(
				validateAvatarFile({ type, size: 1024 * 1024 }),
				null,
				type,
			);
		}
	});
});

describe("resolveDisplayName", () => {
	test("设置了自定义昵称时优先展示昵称", () => {
		assert.strictEqual(resolveDisplayName("  医生甲  ", "doctor_a"), "医生甲");
	});

	test("未设置昵称时回落到登录账号名", () => {
		for (const profileName of ["", "   "]) {
			assert.strictEqual(
				resolveDisplayName(profileName, " doctor_a "),
				"doctor_a",
			);
		}
	});

	test("昵称与账号名都为空时返回空串（由调用方兜底文案）", () => {
		for (const profileName of ["", "   "]) {
			assert.strictEqual(resolveDisplayName(profileName, "  "), "");
		}
	});
});

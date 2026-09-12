// 侧边栏菜单模型的单元测试，使用 Node 内置测试运行器（node --test），不引入任何依赖。
// 运行命令：node --test src/lib/navigation-menu.test.ts
// 之所以能直接运行 .ts：navigation-menu.ts 只包含类型声明与纯函数，运行时不加载任何模块，
// 可被 Node 的类型擦除直接加载；相对导入必须带 .ts 扩展名（与 dashboard-metrics.test.ts 一致）。
// 直接运行 .ts 需要 Node ≥ 22.18 / ≥ 23.6（内置类型擦除默认生效），本仓库实测使用 Node v24.18.0。
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	type MenuDefinition,
	type MenuViewer,
	navigationMenu,
	type SubmenuDefinition,
	visibleMenuItems,
} from "./navigation-menu.ts";

// 本测试文件所在目录与 src/routes 目录，用于校验菜单跳转路径都有对应路由文件。
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = path.resolve(TEST_DIR, "../routes");

// 唯一允许「没有对应路由文件」的白名单：历史遗留占位菜单 /dashboard/setting/default（菜单名 Revenue）。
// 该入口在本次改动之前就存在，仓库里从未提供
// src/routes/dashboard/setting/default/index.tsx 页面；本次改动只涉及组织管理下的科室/子科室
// 与医生专属「我的患者」，不应顺手改动它，因此测试对这一个路径放行。
// 例外只允许这一项：任何新增菜单若指向不存在的路由，下面的断言必须让测试失败。
const ROUTE_FILE_WHITELIST: ReadonlySet<string> = new Set([
	"/dashboard/setting/default",
]);

// ROOT 超级账号：permissions 内含 ROOT，isRoot 为 true，且不是医生账号。
const ROOT_VIEWER: MenuViewer = {
	isRoot: true,
	permissions: ["ROOT"],
	isDoctor: false,
};

// 数据库「医生」角色真实持有的权限码（mis_role_permission 中该角色的授权结果）。
// 父菜单不按权限收敛，这些权限码只影响「我的患者」入口：医生持有
// REGISTRATION:SELECT，因此能看到该医生专属入口。
const DOCTOR_PERMISSION_CODES = [
	"MIS_USER:SELECT",
	"DEPT:SELECT",
	"MEDICAL_DEPT:SELECT",
	"MEDICAL_DEPT_SUB:SELECT",
	"SCHEDULE:SELECT",
	"REGISTRATION:SELECT",
] as const;

// 医生账号：isDoctor 为 true，permissions 取上面的真实权限码。
const DOCTOR_VIEWER: MenuViewer = {
	isRoot: false,
	permissions: [...DOCTOR_PERMISSION_CODES],
	isDoctor: true,
};

// 无任何权限、既不是 ROOT 也不是医生的普通账号。
const PLAIN_VIEWER: MenuViewer = {
	isRoot: false,
	permissions: [],
	isDoctor: false,
};

// 非医生账号可见的父菜单：父菜单可见性与 main 一致（不按权限收敛），
// 「我的患者」因 doctorOnly 而不可见。
const NON_DOCTOR_MENU_IDS = [
	"dashboard",
	"organization",
	"nursing",
	"visiting",
	"setting",
];

// 取出可见菜单的 id 序列，便于断言可见性与顺序。
function visibleIds(
	viewer: MenuViewer,
	items: MenuDefinition[] = navigationMenu,
): string[] {
	return visibleMenuItems(items, viewer).map((item) => item.id);
}

// 按 id 查找父菜单；找不到直接让测试失败，避免断言里出现 undefined 造成误判。
function findMenu(id: string): MenuDefinition {
	const item = navigationMenu.find((menu) => menu.id === id);
	assert.ok(item, `菜单模型中应存在 id 为 ${id} 的父菜单`);
	return item;
}

// 汇总菜单模型中所有需要跳转的路径（父菜单自身的 to + 各子菜单项的 to）。
function collectMenuLinks(): Array<{ label: string; to: string }> {
	const links: Array<{ label: string; to: string }> = [];
	for (const item of navigationMenu) {
		if (item.to) links.push({ label: item.label, to: item.to });

		const submenu: SubmenuDefinition[] | undefined = item.submenu;
		for (const sub of submenu ?? []) {
			links.push({ label: `${item.label} / ${sub.label}`, to: sub.to });
		}
	}
	return links;
}

// 把菜单路径映射为「可能的路由文件」，按仓库实际使用的目录式路由约定解析：
//   /dashboard/catalog/department -> src/routes/dashboard/catalog/department/index.tsx
//   /dashboard/visiting/schedule  -> src/routes/dashboard/visiting/schedule.tsx
// 命中任一候选即视为存在对应路由文件。
// 菜单项只指向页面路由，因此这里不考虑布局路由 route.tsx 以及 .jsx / .js 变体。
function routeFileCandidates(to: string): string[] {
	const segments = to.split("/").filter((segment) => segment.length > 0);
	const base = path.join(ROUTES_DIR, ...segments);
	return [`${base}${path.sep}index.tsx`, `${base}.tsx`];
}

function hasRouteFile(to: string): boolean {
	return routeFileCandidates(to).some((candidate) => existsSync(candidate));
}

describe("菜单结构", () => {
	test("「组织管理」父菜单下恰好是「科室管理」与「子科室管理」", () => {
		const organization = findMenu("organization");
		assert.strictEqual(organization.label, "组织管理");
		// 同时断言 id：子项 id 被 Sidebar 用作 key 与高亮匹配标识，改名应被测试发现。
		assert.deepStrictEqual(
			(organization.submenu ?? []).map((sub) => [sub.id, sub.label, sub.to]),
			[
				["department", "科室管理", "/dashboard/catalog/department"],
				["subdepartment", "子科室管理", "/dashboard/catalog/subdepartment"],
			],
		);
	});

	test("不再存在 id 为 catalog / label 为「基础资料」的父菜单项", () => {
		assert.strictEqual(
			navigationMenu.some((item) => item.id === "catalog"),
			false,
			"「基础资料」父菜单（id=catalog）应已删除",
		);
		assert.strictEqual(
			navigationMenu.some((item) => item.label === "基础资料"),
			false,
			"不应再出现 label 为「基础资料」的父菜单项",
		);
	});
});

describe("菜单可见性 - ROOT 账号", () => {
	test("ROOT 可见所有非医生专属菜单，但不包含「我的患者」", () => {
		const ids = visibleIds(ROOT_VIEWER);
		assert.deepStrictEqual(ids, [
			"dashboard",
			"organization",
			"nursing",
			"visiting",
			"setting",
		]);
		// doctorOnly 判定必须优先于 ROOT 兜底：管理员没有医生身份，打开只会得到 403。
		assert.strictEqual(
			ids.includes("patients"),
			false,
			"doctorOnly 必须优先于 ROOT 兜底，ROOT 不应看到「我的患者」",
		);
	});
});

describe("菜单可见性 - 医生账号", () => {
	test("医生可见全部父菜单，并额外看到医生专属的「我的患者」", () => {
		// 父菜单可见性与 main 保持一致；「我的患者」只受 doctorOnly 约束，
		// 后端仍会对该接口校验访问令牌与 REGISTRATION:SELECT。
		assert.deepStrictEqual(visibleIds(DOCTOR_VIEWER), [
			"dashboard",
			"organization",
			"nursing",
			"visiting",
			"patients",
			"setting",
		]);
	});

	test("医生账号缺少 REGISTRATION:SELECT 时仍看不到「我的患者」", () => {
		// doctorOnly 只表示「仅医生可见」，不等于「医生必然可见」：
		// 仍需命中 permissions，权限被回收后不应继续展示必然 403 的入口。
		const viewer: MenuViewer = {
			isRoot: false,
			isDoctor: true,
			permissions: ["MIS_USER:SELECT", "DEPT:SELECT"],
		};
		assert.strictEqual(visibleIds(viewer).includes("patients"), false);
		// 父菜单不按权限收敛，依然全部可见。
		assert.deepStrictEqual(visibleIds(viewer), NON_DOCTOR_MENU_IDS);
	});
});

describe("菜单可见性 - 普通账号与部分权限", () => {
	test("无任何权限的普通账号可见所有非医生专属菜单", () => {
		// 只有「我的患者」声明了 permissions + doctorOnly；其余父菜单不按权限收敛。
		const menusWithPermissions = navigationMenu
			.filter((item) => (item.permissions?.length ?? 0) > 0)
			.map((item) => item.id);
		assert.deepStrictEqual(menusWithPermissions, ["patients"]);
		assert.deepStrictEqual(visibleIds(PLAIN_VIEWER), NON_DOCTOR_MENU_IDS);
	});

	test("持有部分权限不会让普通账号丢失既有父菜单可见性", () => {
		// 回归保护：菜单可见性不得重新引入按权限收敛，否则 CATALOG:SELECT 这类
		// 数据库中并不存在的编码会让非 ROOT 账号永久看不到既有入口。
		for (const code of ["SCHEDULE:SELECT", "CATALOG:SELECT", "SYSTEM:SELECT"]) {
			const viewer: MenuViewer = {
				isRoot: false,
				isDoctor: false,
				permissions: [code],
			};
			assert.deepStrictEqual(visibleIds(viewer), NON_DOCTOR_MENU_IDS, code);
		}
	});

	test("非医生账号即使持有 REGISTRATION:SELECT 也看不到「我的患者」", () => {
		const viewer: MenuViewer = {
			isRoot: false,
			isDoctor: false,
			permissions: ["REGISTRATION:SELECT"],
		};
		assert.strictEqual(visibleIds(viewer).includes("patients"), false);
	});
});

describe("visibleMenuItems 顺序", () => {
	test("保持 navigationMenu 的原始顺序，且不改动原数组", () => {
		// 先固定父菜单顺序（同时能发现菜单被增删）。
		const originalOrder = navigationMenu.map((item) => item.id);
		assert.deepStrictEqual(originalOrder, [
			"dashboard",
			"organization",
			"nursing",
			"visiting",
			"patients",
			"setting",
		]);

		// 过滤前后快照比对：确认 visibleMenuItems 不会改写传入的菜单数组或菜单项。
		const snapshotBefore = structuredClone(navigationMenu);
		for (const viewer of [ROOT_VIEWER, DOCTOR_VIEWER, PLAIN_VIEWER]) {
			const ids = visibleIds(viewer);
			// 可见结果必须是原始顺序的子序列（按 id 比对，不依赖过滤实现的内部细节）。
			assert.deepStrictEqual(
				ids,
				originalOrder.filter((id) => ids.includes(id)),
			);
		}
		assert.deepStrictEqual(
			navigationMenu,
			snapshotBefore,
			"visibleMenuItems 不应改动传入的菜单数组与菜单项",
		);
	});
});

describe("跳转路径有效性", () => {
	test("菜单中的每个 to 都能在 src/routes 下找到对应路由文件", () => {
		const links = collectMenuLinks();

		// 固定每个父菜单的子项数量：防止将来子项被误删后，遍历断言因「少收集」而静默通过。
		assert.deepStrictEqual(
			navigationMenu.map((item) => [item.id, (item.submenu ?? []).length]),
			[
				["dashboard", 0],
				["organization", 2],
				["nursing", 4],
				["visiting", 3],
				["patients", 0],
				["setting", 1],
			],
		);
		// 2 个父菜单自身跳转（首页、我的患者）+ 10 个子菜单项跳转。
		assert.strictEqual(links.length, 12);

		for (const link of links) {
			if (ROUTE_FILE_WHITELIST.has(link.to)) continue;
			assert.strictEqual(
				hasRouteFile(link.to),
				true,
				`菜单「${link.label}」的跳转路径 ${link.to} 缺少对应路由文件`,
			);
		}
	});

	test("关键路径解析到预期文件（含新增的科室/子科室/我的患者）", () => {
		const expectedFiles = new Map<string, string>([
			["/dashboard", "dashboard/index.tsx"],
			[
				"/dashboard/catalog/department",
				"dashboard/catalog/department/index.tsx",
			],
			[
				"/dashboard/catalog/subdepartment",
				"dashboard/catalog/subdepartment/index.tsx",
			],
			["/dashboard/nursing/doctor", "dashboard/nursing/doctor/index.tsx"],
			["/dashboard/nursing/nurse", "dashboard/nursing/nurse/index.tsx"],
			["/dashboard/nursing/caregiver", "dashboard/nursing/caregiver/index.tsx"],
			[
				"/dashboard/nursing/consultation-fee",
				"dashboard/nursing/consultation-fee/index.tsx",
			],
			["/dashboard/visiting/schedule", "dashboard/visiting/schedule.tsx"],
			[
				"/dashboard/visiting/doctor-visits",
				"dashboard/visiting/doctor-visits.tsx",
			],
			[
				"/dashboard/visiting/video-consultation",
				"dashboard/visiting/video-consultation.tsx",
			],
			["/dashboard/patients", "dashboard/patients/index.tsx"],
		]);

		for (const [to, file] of expectedFiles) {
			const expectedPath = path.join(ROUTES_DIR, file);
			assert.strictEqual(
				existsSync(expectedPath),
				true,
				`${to} 应存在路由文件 src/routes/${file}`,
			);
			// 断言「菜单路径 → 路由文件」的解析结果，而不是只断言某个文件存在；
			// 否则菜单改了 to、或解析规则失效时都测不出来。
			assert.strictEqual(hasRouteFile(to), true, `${to} 应能解析到路由文件`);
			assert.ok(
				routeFileCandidates(to).includes(expectedPath),
				`${to} 的候选路由文件应包含 src/routes/${file}`,
			);
		}
	});

	test("白名单只允许历史遗留的 /dashboard/setting/default 一项", () => {
		assert.deepStrictEqual(
			[...ROUTE_FILE_WHITELIST],
			["/dashboard/setting/default"],
		);
		// 白名单项本身确实没有页面；若哪天补上了页面，本断言会失败并提醒移除白名单。
		assert.strictEqual(hasRouteFile("/dashboard/setting/default"), false);
	});
});

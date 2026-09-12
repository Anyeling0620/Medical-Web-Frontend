// 管理端侧边栏菜单模型与可见性规则。
//
// 本模块刻意保持零运行时依赖（只用类型声明与纯函数），
// 这样可以用 `node --test src/lib/navigation-menu.test.ts` 直接验证可见性规则，
// 与 src/lib/dashboard-metrics.ts 的测试方式一致；图标等 React 相关内容留在 Sidebar 组件里。

// 子菜单项。
//
// to 显式给出跳转路径，而不是按 `${父级id}/${子级id}` 推导：
// 科室管理、子科室管理挂在「组织管理」父菜单下，但路由仍是历史路径
// /dashboard/catalog/**（详情页链接与后端目录接口都依赖它），两者不再同名。
export interface SubmenuDefinition {
	id: string;
	label: string;
	to: string;
}

// 父菜单项的图标键：由 Sidebar 映射为具体的 lucide 图标组件。
export type MenuIconKey =
	| "dashboard"
	| "building"
	| "doctor"
	| "calendar"
	| "patients"
	| "settings";

// 父菜单项。
//
// permissions：命中任一权限编码即可见；未声明表示不按权限收敛（所有登录用户可见）。
// doctorOnly：仅医生账号（登录响应 user.doctorId 非空）可见，用于「我的患者」。
export interface MenuDefinition {
	id: string;
	icon: MenuIconKey;
	label: string;
	badge?: string;
	// 无子菜单时的跳转路径。
	to?: string;
	submenu?: SubmenuDefinition[];
	permissions?: string[];
	doctorOnly?: boolean;
}

// 菜单可见性判定所需的登录者信息（由 localStorage 中的登录结果还原）。
//
// 说明：菜单可见性只用于界面体验（避免展示打开必然 403 的入口），
// 不构成授权——后端始终按访问令牌重新判定权限（契约 §1.2）。
export interface MenuViewer {
	// ROOT 是超级权限：可看到全部非医生专属菜单。
	isRoot: boolean;
	// 完整权限编码列表（后端 permissions 数组）。
	permissions: string[];
	// 登录账号是否绑定医生（后端 user.doctorId 非空）。
	isDoctor: boolean;
}

// 管理端菜单树。
//
// 组织管理下挂「科室管理 / 子科室管理」；原先的「基础资料」父菜单已删除，
// 其子项按业务归属移动到组织管理下。医护管理、出诊管理、系统设置的入口与
// 跳转路径保持原有行为不变。
export const navigationMenu: MenuDefinition[] = [
	{
		id: "dashboard",
		icon: "dashboard",
		label: "首页",
		badge: "New",
		to: "/dashboard",
	},
	{
		id: "organization",
		icon: "building",
		label: "组织管理",
		// 不声明 permissions：父菜单可见性与 main 保持一致（所有登录账号可见），
		// 接口是否有权访问由后端按令牌判定，避免隐藏掉原本存在的入口。
		submenu: [
			{
				id: "department",
				label: "科室管理",
				to: "/dashboard/catalog/department",
			},
			{
				id: "subdepartment",
				label: "子科室管理",
				to: "/dashboard/catalog/subdepartment",
			},
		],
	},
	{
		id: "nursing",
		icon: "doctor",
		label: "医护管理",
		// 不声明 permissions：与 main 的历史可见性保持一致，授权以后端为准。
		submenu: [
			{ id: "doctor", label: "医生管理", to: "/dashboard/nursing/doctor" },
			{ id: "nurse", label: "护士管理", to: "/dashboard/nursing/nurse" },
			{
				id: "caregiver",
				label: "护工管理",
				to: "/dashboard/nursing/caregiver",
			},
			{
				id: "consultation-fee",
				label: "诊费设置",
				to: "/dashboard/nursing/consultation-fee",
			},
		],
	},
	{
		id: "visiting",
		icon: "calendar",
		label: "出诊管理",
		// 不声明 permissions：与 main 的历史可见性保持一致，授权以后端为准。
		submenu: [
			{
				id: "schedule",
				label: "门诊日程表",
				to: "/dashboard/visiting/schedule",
			},
			{
				id: "doctor-visits",
				label: "医生出诊表",
				to: "/dashboard/visiting/doctor-visits",
			},
			{
				id: "video-consultation",
				label: "视频问诊",
				to: "/dashboard/visiting/video-consultation",
			},
		],
	},
	{
		id: "patients",
		icon: "patients",
		label: "我的患者",
		// 医生专属入口：接口只返回登录医生本人接诊过的患者（契约 §6.10），
		// 管理员账号（doctorId 为空）打开只会得到 403，因此不展示。
		to: "/dashboard/patients",
		doctorOnly: true,
		permissions: ["REGISTRATION:SELECT"],
	},
	{
		id: "setting",
		icon: "settings",
		label: "系统设置",
		// 不声明 permissions：保持 main 的历史可见性。
		// 注意 SYSTEM:SELECT 并不是后端使用的权限编码，声明它会让除 ROOT 外的账号永久看不到该入口。
		submenu: [
			{ id: "default", label: "Revenue", to: "/dashboard/setting/default" },
		],
	},
];

// isMenuVisible 判定单个菜单项对当前登录者是否可见。
//
// 判定顺序固定为「先医生专属，再超级权限，最后权限编码」：
// doctorOnly 必须排在 ROOT 放行之前，否则管理员会看到只对医生有意义、
// 且必然返回 403 的「我的患者」入口。
export function isMenuVisible(
	item: MenuDefinition,
	viewer: MenuViewer,
): boolean {
	if (item.doctorOnly && !viewer.isDoctor) return false;
	if (viewer.isRoot) return true;
	if (!item.permissions || item.permissions.length === 0) return true;
	return item.permissions.some((permission) =>
		viewer.permissions.includes(permission),
	);
}

// visibleMenuItems 过滤出当前登录者可见的菜单项，保持原顺序。
export function visibleMenuItems(
	items: MenuDefinition[],
	viewer: MenuViewer,
): MenuDefinition[] {
	return items.filter((item) => isMenuVisible(item, viewer));
}

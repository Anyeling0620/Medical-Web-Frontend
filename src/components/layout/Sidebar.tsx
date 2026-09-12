import { useNavigate } from "@tanstack/react-router";
import {
	Building2,
	CalendarDays,
	ChevronDown,
	LayoutDashboard,
	type LucideIcon,
	Settings,
	Stethoscope,
	Users,
	Zap,
} from "lucide-react";
import { useState } from "react";
import {
	type MenuDefinition,
	type MenuIconKey,
	navigationMenu,
	type SubmenuDefinition,
	visibleMenuItems,
} from "@/lib/navigation-menu";
import { useStoredUser } from "@/lib/stored-user";
import { useUserProfile } from "@/lib/use-user-profile";
import { resolveDisplayName } from "@/lib/user-profile";
import doctorImage from "@/static/doctor.png";

// 菜单图标映射：菜单模型只保存图标键（模型保持零运行时依赖，可在 Node 下直接测试），
// 具体图标组件在这里解析。
const MENU_ICONS: Record<MenuIconKey, LucideIcon> = {
	dashboard: LayoutDashboard,
	building: Building2,
	doctor: Stethoscope,
	calendar: CalendarDays,
	patients: Users,
	settings: Settings,
};

type SidebarProps = {
	collapse: boolean;
	onToggle: () => void;
};

export default function Sidebar({ collapse, onToggle }: SidebarProps) {
	const navigate = useNavigate();

	// 用户展示信息与 Header 一致改为水合后读取：SSR 阶段读取 localStorage 拿不到值，
	// 渲染期读取还会造成服务端与客户端首屏不一致（hydration 报错）。
	// permissionList/doctorId 同时用于菜单可见性判定。
	const { username, permissions, permissionList, doctorId } = useStoredUser();

	// 头像与名称取自本机保存的个性化信息（「系统设置」页可修改）；
	// 未设置时回落到项目默认图标与登录账号名，保持原有展示行为。
	const profile = useUserProfile(username);
	const avatarSrc = profile.avatarDataUrl || doctorImage;
	const displayName = resolveDisplayName(profile.displayName, username);

	// 当前账号可见的菜单：ROOT 见全部；其它账号按权限编码收敛；
	// 「我的患者」仅医生账号（doctorId 非空）可见，判定规则见 navigation-menu.ts。
	const menuItems = visibleMenuItems(navigationMenu, {
		isRoot: permissionList.includes("ROOT"),
		permissions: permissionList,
		isDoctor: doctorId !== null,
	});

	const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

	// 当前高亮的父级 item
	const [activeItemId, setActiveItemId] = useState("dashboard");

	// 当前高亮的子项
	const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);

	const toggleExpanded = (itemId: string) => {
		setExpandedItems((currentItems) => {
			const nextItems = new Set(currentItems);

			if (nextItems.has(itemId)) {
				nextItems.delete(itemId);
			} else {
				nextItems.add(itemId);
			}

			return nextItems;
		});
	};

	const selectItem = (itemId: string, submenuId: string | null = null) => {
		setActiveItemId(itemId);
		setActiveSubmenuId(submenuId);
	};

	const handleItemClick = (item: MenuDefinition) => {
		// 点击父级 item 时，父级高亮，子项取消高亮
		selectItem(item.id);

		if (item.submenu) {
			if (collapse) {
				onToggle();
			}

			toggleExpanded(item.id);
			return;
		}

		navigate({
			to: item.to ?? `/${item.id}`,
		});
	};

	const handleSubmenuClick = (itemId: string, submenu: SubmenuDefinition) => {
		// 点击子项后，子项高亮，父项不再高亮
		selectItem(itemId, submenu.id);
		// 子路由路径由菜单模型给出：科室/子科室管理挂在组织管理下，
		// 但路由仍是 /dashboard/catalog/**，不能再按 `${父级id}/${子级id}` 推导。
		navigate({
			to: submenu.to,
		});
	};

	return (
		<div
			className={`${
				collapse ? "w-20" : "w-62 md:w-72"
			} relative z-10 flex flex-col border-r border-slate-200/50 bg-white/80 backdrop-blur-xl transition-all duration-200 ease-in-out`}
		>
			{/* Logo */}
			<div className="border-b border-slate-200/50 p-6">
				<div className="flex items-center space-x-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-r from-blue-600 to-purple-600 shadow-lg">
						<Zap className="h-6 w-6 text-white" />
					</div>

					{!collapse && (
						<div>
							<h1 className="text-xl font-bold text-slate-800">Nexus</h1>

							<p className="text-xs font-bold text-slate-500">Admin Panel</p>
						</div>
					)}
				</div>
			</div>

			{/* Navigation */}
			<nav className="flex-1 space-y-2 overflow-y-auto p-4">
				{menuItems.map((item) => {
					const isExpanded = expandedItems.has(item.id);

					// 只有父级本身被选中且没有选中子项时，父级才高亮
					const isActive = activeItemId === item.id && activeSubmenuId === null;
					const Icon = MENU_ICONS[item.icon];

					return (
						<div key={item.id}>
							<button
								type="button"
								className={`flex w-full items-center rounded-xl p-3 transition-all duration-200 ${
									collapse ? "justify-center" : "justify-between"
								} ${
									isActive
										? "bg-linear-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25"
										: "text-slate-600 hover:bg-slate-100"
								}`}
								aria-label={collapse ? item.label : undefined}
								title={collapse ? item.label : undefined}
								onClick={() => handleItemClick(item)}
							>
								<div
									className={`${
										collapse ? "w-auto justify-center" : "w-full space-x-3"
									} flex items-center`}
								>
									<Icon className="h-5 w-5 shrink-0" />

									{!collapse && (
										<div className="flex w-full justify-between">
											<span className="ml-2 font-medium">{item.label}</span>

											{item.badge && (
												<span className="rounded-full bg-red-500 px-2 py-1 text-xs text-white">
													{item.badge}
												</span>
											)}
										</div>
									)}
								</div>

								{!collapse && item.submenu && (
									<ChevronDown
										className={`ml-1 h-4 w-4 transition-transform ${
											isExpanded ? "rotate-180" : ""
										}`}
									/>
								)}
							</button>

							{/* Submenu */}
							{!collapse && item.submenu && isExpanded && (
								<div className="ml-8 mt-2 space-y-1">
									{item.submenu.map((submenu) => {
										const isSubmenuActive =
											activeItemId === item.id &&
											activeSubmenuId === submenu.id;

										return (
											<button
												key={submenu.id}
												type="button"
												className={`w-full rounded-lg p-2 text-left text-sm transition-all ${
													isSubmenuActive
														? "bg-linear-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25"
														: "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
												}`}
												onClick={() => handleSubmenuClick(item.id, submenu)}
											>
												{submenu.label}
											</button>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</nav>

			{/* User Profile */}
			{!collapse && (
				<div className="border-t border-slate-200/50 p-4">
					<div className="flex items-center space-x-3 rounded-xl bg-slate-50 p-3">
						<img
							src={avatarSrc}
							alt="user"
							className="h-10 w-10 rounded-full object-cover ring-2 ring-blue-500"
						/>

						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium text-slate-800">
								{displayName || "管理员"}
							</p>

							<p className="truncate text-xs text-slate-500">
								{permissions || "—"}
							</p>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

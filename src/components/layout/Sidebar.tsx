import { useNavigate } from "@tanstack/react-router";
import {
	BarChart3,
	Building2,
	ChevronDown,
	LayoutDashboard,
	type LucideIcon,
	Stethoscope,
	// ListChecks,
	// Package,
	// ShoppingCart,
	Zap,
} from "lucide-react";
import { useState } from "react";
import doctorImage from "@/static/doctor.png";

type SubmenuItem = {
	id: string;
	label: string;
};

type MenuItem = {
	id: string;
	icon: LucideIcon;
	label: string;
	badge?: string;
	submenu?: SubmenuItem[];
};

const menuItems: MenuItem[] = [
	{
		id: "dashboard",
		icon: LayoutDashboard,
		label: "首页",
		badge: "New",
	},
	{
		id: "organization",
		icon: BarChart3,
		label: "组织管理",
		submenu: [{ id: "default", label: "Revenue" }],
	},
	{
		id: "catalog",
		icon: Building2,
		label: "基础资料",
		// 科室管理入口，点击跳转 /dashboard/catalog/department
		submenu: [{ id: "department", label: "科室管理" }],
	},
	{
		id: "nursing",
		icon: Stethoscope,
		label: "医护管理",
		// 医护管理保留 4 个子菜单：医生/护士/护工管理与诊费设置。
		// 医生管理已有真实后端与页面；其余子菜单当前无调用历史，仅保留入口占位。
		submenu: [
			{ id: "doctor", label: "医生管理" },
			{ id: "nurse", label: "护士管理" },
			{ id: "caregiver", label: "护工管理" },
			{ id: "consultation-fee", label: "诊费设置" },
		],
	},
	{
		id: "visiting",
		icon: BarChart3,
		label: "出诊管理",
		// 出诊管理子菜单：门诊日程表 / 医生出诊表 / 视频问诊。
		// 三者当前无前端调用历史，仅保留入口占位，后续接入对应接口。
		submenu: [
			{ id: "schedule", label: "门诊日程表" },
			{ id: "doctor-visits", label: "医生出诊表" },
			{ id: "video-consultation", label: "视频问诊" },
		],
	},
	{
		id: "setting",
		icon: BarChart3,
		label: "系统设置",
		submenu: [{ id: "default", label: "Revenue" }],
	},
];

type SidebarProps = {
	collapse: boolean;
	onToggle: () => void;
};

// 从 localStorage 读取 JSON 字符串：key 为空或解析失败时返回兜底文案，避免整个侧边栏崩溃。
function readStoredString(key: string, fallback: string): string {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as unknown;
		return typeof parsed === "string" ? parsed : fallback;
	} catch {
		return fallback;
	}
}

export default function Sidebar({ collapse, onToggle }: SidebarProps) {
	const navigate = useNavigate();

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

	const handleItemClick = (item: MenuItem) => {
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
			to: `/${item.id}`,
		});
	};

	const handleSubmenuClick = (itemId: string, submenuId: string) => {
		// 点击子项后，子项高亮，父项不再高亮
		selectItem(itemId, submenuId);
		navigate({
			// 子路由位于 /dashboard 布局路由下，需补齐 /dashboard 前缀
			to: `/dashboard/${itemId}/${submenuId}`,
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
									<item.icon className="h-5 w-5 shrink-0" />

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
												onClick={() => handleSubmenuClick(item.id, submenu.id)}
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
							src={doctorImage}
							alt="user"
							className="h-10 w-10 rounded-full object-cover ring-2 ring-blue-500"
						/>

						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium text-slate-800">
								{readStoredString("username", "管理员")}
							</p>

							<p className="truncate text-xs text-slate-500">
								{readStoredString("permissions", "—")}
							</p>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

import {
	Bell,
	ChevronDown,
	Filter,
	Menu,
	Plus,
	Search,
	Settings,
	Sun,
} from "lucide-react";
import { useStoredUser } from "@/lib/stored-user";
import { useUserProfile } from "@/lib/use-user-profile";
import { resolveDisplayName } from "@/lib/user-profile";
import doctorImage from "@/static/doctor.png";

type HeaderProps = {
	onToggleSidebar: () => void;
};

export default function Header({ onToggleSidebar }: HeaderProps) {
	// 用户展示信息改为水合后读取：SSR 阶段没有 localStorage，
	// 渲染期直接读取会抛错，并导致 /dashboard/** 整体回退为客户端渲染。
	const { username, permissions } = useStoredUser();

	// 头像与名称取自本机保存的个性化信息（「系统设置」页可修改）；
	// 未设置时回落到项目默认图标与登录账号名，保持原有展示行为。
	const profile = useUserProfile(username);
	const avatarSrc = profile.avatarDataUrl || doctorImage;
	const displayName = resolveDisplayName(profile.displayName, username);

	const keepLightTheme = () => {
		document.documentElement.classList.remove("dark");
	};
	return (
		<div className="@container shrink-0 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 px-3 sm:px-6 py-4 text-slate-800 transition-colors duration-200">
			<div className="flex flex-wrap items-center justify-between gap-3">
				{/* Left Section */}
				<div className="flex items-center space-x-4">
					<button
						type="button"
						className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
						onClick={onToggleSidebar}
						aria-label="Toggle sidebar"
						title="Toggle sidebar"
					>
						<Menu className="w-5 h-5" />
					</button>

					<div className="hidden @min-[640px]:block">
						<h1 className="text-2xl font-black text-slate-800">
							医疗系统管理面板
						</h1>

						{/*<p>Welcome back, Anyeling! Here's what's happening today.</p>*/}
					</div>
				</div>

				{/* Center */}
				<div className="hidden @min-[1100px]:block min-w-48 flex-1 max-w-md mx-8">
					<div className="relative">
						<Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />

						<input
							type="text"
							placeholder="Search anything"
							aria-label="Search anything"
							className="w-full pl-10 pr-12 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
						/>

						<button
							type="button"
							className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600"
							aria-label="Filter search results"
							title="Filter search results"
						>
							<Filter className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* Right */}
				<div className="flex shrink-0 items-center gap-2 @min-[640px]:gap-3">
					{/* Quick Action */}
					<button
						type="button"
						className="hidden @min-[1100px]:flex shrink-0 items-center space-x-2 py-2 px-4 bg-linear-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all"
					>
						<Plus className="w-4 h-4" />
						<span className="text-sm font-medium">New</span>
					</button>

					{/* Theme */}
					<button
						type="button"
						className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
						onClick={keepLightTheme}
						aria-label="Use light theme"
						title="Light theme"
					>
						<Sun className="w-5 h-5" />
					</button>

					{/* Notification */}
					<button
						type="button"
						className="relative p-2.5 rounded-xl text-slate-600 hover:bg-slate-100"
						aria-label="Notifications"
						title="Notifications"
					>
						<Bell className="w-5 h-5" />

						<span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
							3
						</span>
					</button>

					{/* Setting */}
					<button
						type="button"
						className="p-2.5 rounded-xl text-slate-600 hover:bg-slate-100"
						aria-label="Settings"
						title="Settings"
					>
						<Settings className="w-5 h-5" />
					</button>

					{/* User Profile */}
					<div className="flex items-center space-x-3 pl-3 border-l border-slate-200">
						<img
							src={avatarSrc}
							alt="user"
							className="w-8 h-8 shrink-0 object-cover rounded-full ring-2 ring-blue-500"
						/>

						<div className="hidden @min-[640px]:block max-w-32 break-words">
							<p className="text-sm font-medium text-slate-500">
								{displayName}
							</p>

							<p className="text-xs font-medium text-slate-500">
								{permissions}
							</p>
						</div>

						<ChevronDown className="w-4 h-4 text-slate-400" />
					</div>
				</div>
			</div>
		</div>
	);
}

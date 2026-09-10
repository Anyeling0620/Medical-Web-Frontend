import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { checkRouteGuard } from "@/lib/auth-session";

export const Route = createFileRoute("/dashboard")({
	// 未登录访问 /dashboard 及其子路由时统一跳转 /login。
	beforeLoad: async ({ location }) => {
		const target = await checkRouteGuard(location.pathname);
		if (target) throw redirect({ to: target });
	},
	component: AdminLayout,
});

export default function AdminLayout() {
	const [sidebarCollapse, setSidebarCollapse] = useState(false);

	const toggleSidebar = () => {
		setSidebarCollapse((collapsed) => !collapsed);
	};

	return (
		<div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-50 transition-all duration-500">
			<div className="flex h-screen overflow-hidden">
				<Sidebar collapse={sidebarCollapse} onToggle={toggleSidebar} />

				<div className="flex-1 flex flex-col overflow-hidden">
					<Header onToggleSidebar={toggleSidebar} />

					<main className="flex-1 overflow-y-auto bg-transparent">
						<div className="p-6 space-y-6">
							<Outlet />
						</div>
					</main>
				</div>
			</div>
		</div>
	);
}

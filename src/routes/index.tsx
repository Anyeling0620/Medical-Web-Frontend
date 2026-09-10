import { createFileRoute, redirect } from "@tanstack/react-router";
import AuthChecking from "@/components/layout/AuthChecking";
import { checkRouteGuard } from "@/lib/auth-session";

// 根路径只做登录态分流：已登录 => /dashboard，未登录 => /login。
export const Route = createFileRoute("/")({
	beforeLoad: async ({ location }) => {
		const target = await checkRouteGuard(location.pathname);
		if (target) throw redirect({ to: target });
	},
	// 服务端渲染阶段不判定登录态，先展示占位，水合后由根组件补一次校验再分流。
	// 注意：不要把同一个外部导入的组件同时用作 component 与 pendingComponent，
	// 路由的自动代码分割会把该 import 移入 split chunk，遗留未声明引用导致运行时报错。
	component: AuthChecking,
});

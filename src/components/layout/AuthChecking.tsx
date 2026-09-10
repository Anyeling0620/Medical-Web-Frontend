// 登录态校验期间的全屏占位：避免白屏，也避免未确认登录态就渲染受保护页面。
export default function AuthChecking() {
	return (
		<div className="flex h-screen w-full items-center justify-center bg-linear-to-br from-slate-50 via-blue-50 to-indigo-50">
			<div className="flex flex-col items-center gap-3">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
				<p className="text-sm text-slate-500">正在校验登录状态…</p>
			</div>
		</div>
	);
}

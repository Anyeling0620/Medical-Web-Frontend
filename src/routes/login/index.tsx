import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { type FormEvent, useState } from "react";
import { login } from "@/api/auth";
import { getApiErrorMessage } from "@/lib/api-error";
import { checkRouteGuard, setSession } from "@/lib/auth-session";
import {
	GUEST_ACCOUNT_NOTICE,
	GUEST_PASSWORD,
	GUEST_USERNAME,
} from "@/lib/guest-account";

export const Route = createFileRoute("/login/")({
	// 已登录用户访问 /login 时不再展示登录表单，直接进入 /dashboard。
	beforeLoad: async ({ location }) => {
		const target = await checkRouteGuard(location.pathname);
		if (target) throw redirect({ to: target });
	},
	component: LoginPage,
});

// 输入框统一样式：只保留边框与聚焦态，不加装饰性阴影。
const INPUT_CLASS =
	"h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50";

function LoginPage() {
	const navigate = useNavigate();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [passwordVisible, setPasswordVisible] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isGuestSubmitting, setIsGuestSubmitting] = useState(false);

	// 任一入口提交中，都冻结两个入口，避免同一浏览器同时建立两种会话。
	const isBusy = isSubmitting || isGuestSubmitting;

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const normalizedUsername = username.trim();

		if (
			normalizedUsername === "" ||
			normalizedUsername.length > 20 ||
			password.length < 8
		) {
			setErrorMessage("用户名不能为空或超过20个字符，密码长度不能低于8位");
			return;
		}

		setErrorMessage("");
		setIsSubmitting(true);

		try {
			const response = await login({
				username: normalizedUsername,
				password,
			});

			// 登录成功记录会话：写入内存缓存（供路由守卫复用）与 Header/Sidebar 依赖的展示数据。
			setSession(response);

			await navigate({
				to: "/dashboard",
			});
		} catch (error) {
			setErrorMessage(getApiErrorMessage(error));
		} finally {
			setIsSubmitting(false);
		}
	}

	// 访客登录：用数据库里的只读账号走与管理端相同的登录接口，
	// 权限完全由该账号绑定的「访客」角色决定（见 src/lib/guest-account.ts）。
	async function handleGuestLogin() {
		if (isBusy) return;

		setErrorMessage("");
		setIsGuestSubmitting(true);

		try {
			const response = await login({
				username: GUEST_USERNAME,
				password: GUEST_PASSWORD,
			});
			setSession(response);

			await navigate({ to: "/dashboard" });
		} catch (error) {
			setErrorMessage(getApiErrorMessage(error));
		} finally {
			setIsGuestSubmitting(false);
		}
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4">
			<div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
				<h1 className="text-lg font-semibold text-slate-900">
					医疗系统管理面板
				</h1>
				<p className="mt-1 text-xs text-slate-500">请使用院内账号登录</p>

				<form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
					<label className="flex flex-col gap-1.5">
						<span className="text-xs font-medium text-slate-600">账号</span>
						<input
							className={INPUT_CLASS}
							placeholder="请输入账号"
							type="text"
							autoComplete="username"
							value={username}
							onChange={(event) => setUsername(event.target.value)}
							disabled={isBusy}
						/>
					</label>

					<label className="flex flex-col gap-1.5">
						<span className="text-xs font-medium text-slate-600">密码</span>
						<span className="relative block">
							<input
								className={`${INPUT_CLASS} pr-10`}
								placeholder="请输入密码"
								type={passwordVisible ? "text" : "password"}
								autoComplete="current-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								disabled={isBusy}
							/>
							<button
								type="button"
								onClick={() => setPasswordVisible((visible) => !visible)}
								className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-600"
								aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
								title={passwordVisible ? "隐藏密码" : "显示密码"}
								disabled={isBusy}
							>
								{passwordVisible ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
							</button>
						</span>
					</label>

					{errorMessage ? (
						<p className="text-xs text-rose-600" role="alert">
							{errorMessage}
						</p>
					) : null}

					<button
						type="submit"
						disabled={isBusy}
						className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isSubmitting ? "登录中..." : "登录"}
						<ArrowRight className="h-4 w-4" />
					</button>
				</form>

				{/* 访客入口：次要动作，与账号登录同一卡片内的分隔区，不另起一块视觉区域 */}
				<div className="mt-5 border-t border-slate-100 pt-4">
					<button
						type="button"
						onClick={() => void handleGuestLogin()}
						disabled={isBusy}
						className="h-10 w-full rounded-lg border border-slate-300 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isGuestSubmitting ? "登录中..." : "访客登录"}
					</button>
					<p className="mt-2 text-xs text-slate-400">{GUEST_ACCOUNT_NOTICE}</p>
				</div>
			</div>

			{/* 登录卡片下方的作者作品集入口：仅作展示，不参与任何登录逻辑 */}
			<p className="mt-4 text-center text-md text-slate-400">
				个人作品集:{" "}
				<a
					className="text-slate-500 underline decoration-dotted underline-offset-2 transition hover:text-blue-600 text-md"
					href="https://jxutcm.top"
					target="_blank"
					rel="noreferrer"
				>
					jxutcm.top
				</a>
			</p>
		</div>
	);
}

import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { type FormEvent, useState } from "react";
import { login } from "@/api/auth";
import { getApiErrorMessage } from "@/lib/api-error";
import { checkRouteGuard, setSession } from "@/lib/auth-session";
import homeImage from "@/static/home.png";

export const Route = createFileRoute("/login/")({
	// 已登录用户访问 /login 时不再展示登录表单，直接进入 /dashboard。
	beforeLoad: async ({ location }) => {
		const target = await checkRouteGuard(location.pathname);
		if (target) throw redirect({ to: target });
	},
	component: Home,
});

function Home() {
	const navigate = useNavigate();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

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
			// 统一错误响应已包装为 ApiError，这里展示面向用户的 message。
			setErrorMessage(getApiErrorMessage(error));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="flex h-screen w-full flex-col items-center justify-center bg-blue-500">
			<div className="grid h-[70%] w-[60%] grid-cols-2 gap-4 rounded-2xl border-none bg-gray-200 p-16 text-center shadow-2xl">
				<div className="flex h-full w-full flex-col items-center justify-center gap-4">
					<img src={homeImage} alt="主页" />
					<h1 className="text-xl">医疗系统管理面板</h1>
				</div>

				<form
					className="flex h-full w-full flex-col items-center justify-center gap-6"
					onSubmit={handleSubmit}
				>
					<div className="flex w-full max-w-md items-center gap-2">
						<input
							className="h-8 w-full border-b border-gray-400 px-4 py-2 transition focus:border-indigo-800 focus:outline-none"
							placeholder="输入管理员账号用户名"
							type="text"
							value={username}
							onChange={(event) => setUsername(event.target.value)}
							disabled={isSubmitting}
						/>
					</div>

					<div className="flex w-full max-w-md items-center gap-2">
						<input
							className="h-8 w-full border-b border-gray-400 px-4 py-2 transition focus:border-indigo-800 focus:outline-none"
							placeholder="输入管理员账号密码"
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							disabled={isSubmitting}
						/>
					</div>

					{errorMessage ? (
						<p className="w-full max-w-md text-left text-sm text-red-600">
							{errorMessage}
						</p>
					) : null}

					<div className="flex w-full max-w-md items-center gap-2">
						<button
							className="flex h-full w-full justify-between bg-indigo-600 px-6 py-4 disabled:opacity-60"
							type="submit"
							disabled={isSubmitting}
						>
							<span className="text-white">
								{isSubmitting ? "登录中..." : "登录"}
							</span>
							<ArrowRight className="text-white" />
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

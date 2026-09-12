import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, LogOut, RotateCcw, Save } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { logout } from "@/api/auth";
import {
	Button,
	ConfirmDialog,
	Field,
	FormError,
	inputClassName,
} from "@/components/ui";
import { clearSession } from "@/lib/auth-session";
import { useStoredUser } from "@/lib/stored-user";
import { useUserProfile } from "@/lib/use-user-profile";
import {
	AVATAR_MAX_EDGE,
	clearStoredUserProfile,
	MAX_AVATAR_SOURCE_BYTES,
	MAX_DISPLAY_NAME_LENGTH,
	resolveDisplayName,
	truncateDisplayName,
	validateAvatarFile,
	validateDisplayName,
	writeStoredUserProfile,
} from "@/lib/user-profile";
import doctorImage from "@/static/doctor.png";

// 路由声明：「系统设置」父菜单的唯一页面（该菜单项不含子菜单，见 src/lib/navigation-menu.ts）。
// 页面提供修改头像、修改名称与退出登录；头像与名称按登录账号保存在浏览器本地。
export const Route = createFileRoute("/dashboard/setting/")({
	component: SettingPage,
});

// 头像格式与体积提示：数值取自 user-profile 的常量，避免文案与实际限制不一致。
const AVATAR_HINT = `支持 PNG / JPG / WebP，单张不超过 ${MAX_AVATAR_SOURCE_BYTES / (1024 * 1024)}MB，保存前自动压缩到 ${AVATAR_MAX_EDGE}px`;

// 名称提示：说明展示位置与长度上限。
const NAME_HINT = `展示在页面右上角与左下角，最多 ${MAX_DISPLAY_NAME_LENGTH} 个字符（超出部分自动截断）；留空即使用登录账号名`;

// 读取本地图片文件为可绘制的图片对象，失败时给出面向用户的提示。
function loadImageElement(objectUrl: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("图片解析失败，请更换图片后重试"));
		image.src = objectUrl;
	});
}

// 把用户选择的头像压缩成 data URL：等比缩放到最长边 AVATAR_MAX_EDGE，再按原格式编码，
// 避免把几 MB 的原图直接写进 localStorage。PNG 保留透明通道，其余格式统一转 JPEG 以减小体积。
async function fileToAvatarDataUrl(file: File): Promise<string> {
	const objectUrl = URL.createObjectURL(file);

	try {
		const image = await loadImageElement(objectUrl);
		const longestEdge = Math.max(image.width, image.height);
		const scale =
			longestEdge > AVATAR_MAX_EDGE ? AVATAR_MAX_EDGE / longestEdge : 1;
		const width = Math.max(1, Math.round(image.width * scale));
		const height = Math.max(1, Math.round(image.height * scale));

		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		const context = canvas.getContext("2d");
		if (!context) throw new Error("当前浏览器不支持 Canvas，无法处理头像图片");

		context.drawImage(image, 0, 0, width, height);

		const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
		return canvas.toDataURL(mimeType, 0.85);
	} finally {
		// 图片已经绘制完成，及时释放临时对象地址。
		URL.revokeObjectURL(objectUrl);
	}
}

function SettingPage() {
	const navigate = useNavigate();

	// 展示与存储都依赖登录账号：账号名只在水合完成后才有值（见 src/lib/stored-user.ts）。
	const { username } = useStoredUser();
	const profile = useUserProfile(username);

	// 表单草稿：首次水合、保存成功与「恢复默认」后都会与已保存内容同步。
	const [draftName, setDraftName] = useState("");
	const [draftAvatar, setDraftAvatar] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [isBusy, setIsBusy] = useState(false);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// 上一次已保存内容的快照：用来区分「用户正在编辑的草稿」与「已保存内容」。
	const lastSavedProfileRef = useRef({ displayName: "", avatarDataUrl: "" });

	useEffect(() => {
		const saved = {
			displayName: profile.displayName,
			avatarDataUrl: profile.avatarDataUrl,
		};
		const previous = lastSavedProfileRef.current;
		lastSavedProfileRef.current = saved;

		// 只覆盖「仍等于上一次已保存值」的草稿：用户正在编辑时保留输入，
		// 避免被外部变更（例如另一个标签页保存）冲掉；首次水合时会正常填入本机保存值。
		setDraftName((current) =>
			current === previous.displayName ? saved.displayName : current,
		);
		setDraftAvatar((current) =>
			current === previous.avatarDataUrl ? saved.avatarDataUrl : current,
		);
	}, [profile.displayName, profile.avatarDataUrl]);

	// 预览头像：优先未保存的草稿，其次已保存内容，都没有时展示项目默认图标。
	const avatarPreview = draftAvatar || profile.avatarDataUrl || doctorImage;
	// 预览名称与 Header / Sidebar 保持一致：自定义昵称 > 登录账号名 > 默认文案。
	const previewName = resolveDisplayName(draftName, username) || "管理员";
	// 水合完成前账号名未知，此时不能读写存储（否则会落在空的存储键上）。
	const storageReady = username !== "";

	const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		// 先清空 input 的值：同一个文件连续选择两次时也要能再次触发 change 事件。
		event.target.value = "";
		if (!file) return;

		const fileError = validateAvatarFile(file);
		if (fileError) {
			setErrorMessage(fileError);
			setSuccessMessage("");
			return;
		}

		setErrorMessage("");
		setSuccessMessage("");
		setIsBusy(true);
		try {
			setDraftAvatar(await fileToAvatarDataUrl(file));
			setSuccessMessage("头像已选择，点击「保存」后生效");
		} catch (error) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: "头像处理失败，请更换图片后重试",
			);
		} finally {
			setIsBusy(false);
		}
	};

	const handleSave = () => {
		// 写入时会按 trim 归一化，这里先算出来，保证输入框与已保存内容一致。
		const normalizedName = draftName.trim();
		const nameError = validateDisplayName(normalizedName);
		if (nameError) {
			setErrorMessage(nameError);
			setSuccessMessage("");
			return;
		}

		const saved = writeStoredUserProfile(username, {
			displayName: normalizedName,
			avatarDataUrl: draftAvatar,
		});
		if (!saved) {
			setErrorMessage(
				"保存失败：浏览器不允许写入本地存储（可能是隐私模式或存储空间不足）",
			);
			setSuccessMessage("");
			return;
		}

		// 输入框同步为归一化后的值（写入时按 trim 处理），避免显示带首尾空格的草稿。
		setDraftName(normalizedName);
		setErrorMessage("");
		setSuccessMessage(
			"已保存：头像与名称只保存在本机浏览器，换设备登录需重新设置",
		);
	};

	const handleReset = () => {
		const cleared = clearStoredUserProfile(username);
		if (!cleared) {
			setErrorMessage("恢复默认失败：浏览器不允许写入本地存储");
			setSuccessMessage("");
			return;
		}

		// 一并清空草稿：恢复默认是「把本机设置全部清掉」，
		// 否则刚选好但没保存的头像/名称会继续显示在预览里，提示与画面不一致。
		setDraftName("");
		setDraftAvatar("");
		setErrorMessage("");
		setSuccessMessage("已恢复默认头像与名称");
	};

	const handleLogout = async () => {
		setLogoutConfirmOpen(false);
		setIsLoggingOut(true);
		try {
			// 接口规范 §3.3：撤销服务端会话（成功 204）。
			await logout();
		} catch {
			// 令牌已失效或后端不可用时忽略错误，继续本地登出：
			// 否则用户会被困在管理端页面里退不出去。
		} finally {
			// 必须清理内存会话与展示数据，否则最长 30 秒内仍会被判定为已登录（见 auth-session.ts）。
			clearSession();
			setIsLoggingOut(false);
		}

		await navigate({ to: "/login" });
	};

	return (
		<main className="min-h-screen bg-[#f5f7fb]">
			<div className="mx-auto max-w-[900px] space-y-4">
				{/* 页面说明 */}
				<header className="border border-slate-200 bg-white p-4 shadow-sm">
					<h1 className="text-lg font-semibold text-slate-800">系统设置</h1>
					<p className="mt-1 text-sm text-slate-500">
						头像与名称保存在本机浏览器，并按登录账号分别记录；未设置时展示项目默认图标与登录账号名。
					</p>
				</header>

				{/* 个人资料：头像 + 名称 + 操作 */}
				<section className="border border-slate-200 bg-white p-6 shadow-sm">
					<h2 className="text-base font-semibold text-slate-800">个人资料</h2>

					<div className="mt-5 flex flex-wrap items-start gap-8">
						{/* 头像：预览 + 选择 + 限制说明 */}
						<div className="flex w-52 flex-col items-center gap-3">
							<img
								src={avatarPreview}
								alt="头像预览"
								className="h-24 w-24 rounded-full object-cover ring-2 ring-blue-500"
							/>

							<Button
								onClick={() => fileInputRef.current?.click()}
								disabled={isBusy}
							>
								<Camera className="h-4 w-4" />
								选择头像
							</Button>

							<input
								ref={fileInputRef}
								type="file"
								accept="image/png,image/jpeg,image/webp"
								className="hidden"
								onChange={handleAvatarChange}
							/>

							<span className="text-center text-xs font-normal text-slate-400">
								{AVATAR_HINT}
							</span>
						</div>

						{/* 名称：输入 + 当前展示效果 */}
						<div className="min-w-64 flex-1 space-y-4">
							<Field label="名称" hint={NAME_HINT}>
								<input
									className={inputClassName}
									value={draftName}
									placeholder={username || "请输入名称"}
									onChange={(event) => {
										// 按码点收敛：maxLength 按 UTF-16 单元计数，emoji 会在输入一半时被截断。
										setDraftName(truncateDisplayName(event.target.value));
										// 用户继续编辑时清掉上一次的提示，避免误以为已经保存成功。
										setErrorMessage("");
										setSuccessMessage("");
									}}
								/>
							</Field>

							<div className="flex items-center gap-3 rounded-md bg-slate-50 p-3">
								<img
									src={avatarPreview}
									alt="展示效果预览"
									className="h-9 w-9 rounded-full object-cover ring-2 ring-blue-500"
								/>

								<div className="min-w-0">
									<p className="truncate text-sm font-medium text-slate-800">
										{previewName}
									</p>
									<p className="text-xs text-slate-400">当前展示效果</p>
								</div>
							</div>

							{errorMessage ? <FormError>{errorMessage}</FormError> : null}

							{successMessage ? (
								<p className="text-xs font-medium text-emerald-600">
									{successMessage}
								</p>
							) : null}
						</div>
					</div>

					{/* 操作区：保存 / 恢复默认 / 退出登录 */}
					<div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
						<Button
							variant="primary"
							onClick={handleSave}
							disabled={isBusy || !storageReady}
						>
							<Save className="h-4 w-4" />
							保存
						</Button>

						<Button
							onClick={handleReset}
							disabled={isBusy || !storageReady}
							title="清除本机保存的头像与名称"
						>
							<RotateCcw className="h-4 w-4" />
							恢复默认
						</Button>

						<Button
							variant="danger"
							onClick={() => setLogoutConfirmOpen(true)}
							disabled={isLoggingOut}
						>
							<LogOut className="h-4 w-4" />
							{isLoggingOut ? "退出中..." : "退出登录"}
						</Button>
					</div>
				</section>
			</div>

			<ConfirmDialog
				open={logoutConfirmOpen}
				title="退出登录"
				message="退出后需要重新输入账号密码登录；本机保存的头像与名称会保留。"
				confirmText="退出登录"
				danger
				loading={isLoggingOut}
				onConfirm={handleLogout}
				onCancel={() => setLogoutConfirmOpen(false)}
			/>
		</main>
	);
}

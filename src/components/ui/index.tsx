// 出诊管理页面共用的轻量 UI 基础组件：按钮、表单控件、弹窗与确认框。
// 仅依赖 Tailwind 与 lucide-react，统一交互与样式，避免各页面重复实现导致风格不一致。
import { X } from "lucide-react";
import type {
	ButtonHTMLAttributes,
	InputHTMLAttributes,
	ReactNode,
	SelectHTMLAttributes,
} from "react";
import { useEffect } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
	primary:
		"bg-linear-to-r from-blue-500 to-purple-600 text-white shadow-sm hover:opacity-90",
	secondary:
		"border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
	danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
	ghost: "text-blue-600 hover:text-blue-700",
};

// 统一按钮：默认 type="button"，避免在表单内被当成提交按钮。
export function Button({
	variant = "secondary",
	className = "",
	...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
	return (
		<button
			type="button"
			className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
			{...rest}
		/>
	);
}

// 表单控件统一外观：输入框、下拉框共用，保证高度与焦点样式一致。
export const inputClassName =
	"h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";

// 表单字段容器：标签 + 控件 + 提示文案。
// 用 div 而非 label 包裹：控件由调用方传入且可能是多个元素（如滑块 + 步进器按钮组），
// 用 label 会造成关联不明确（biome a11y 规则）。
export function Field({
	label,
	hint,
	required,
	children,
}: {
	label: string;
	hint?: string;
	required?: boolean;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
			<span>
				{label}
				{required ? <span className="text-red-500"> *</span> : null}
			</span>
			{children}
			{hint ? (
				<span className="text-xs font-normal text-slate-400">{hint}</span>
			) : null}
		</div>
	);
}

export function TextInput({
	className = "",
	...rest
}: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input type="text" className={`${inputClassName} ${className}`} {...rest} />
	);
}

// 数字输入：调用方通过 min/max/step 约束取值范围。
export function NumberInput({
	className = "",
	...rest
}: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			type="number"
			className={`${inputClassName} ${className}`}
			{...rest}
		/>
	);
}

export function SelectInput({
	className = "",
	children,
	...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<select className={`${inputClassName} ${className}`} {...rest}>
			{children}
		</select>
	);
}

// 表单级错误文案（校验失败或接口 4xx/5xx 提示）。
export function FormError({ children }: { children: ReactNode }) {
	return <p className="text-xs font-medium text-red-600">{children}</p>;
}

// 通用弹窗：遮罩 + 标题栏 + 内容区 + 可选底部操作区，支持 Esc 与点击遮罩关闭。
export function Modal({
	open,
	title,
	onClose,
	children,
	footer,
	widthClassName = "max-w-lg",
}: {
	open: boolean;
	title: string;
	onClose: () => void;
	children: ReactNode;
	footer?: ReactNode;
	widthClassName?: string;
}) {
	// Esc 关闭：仅在打开时绑定键盘监听，避免页面常驻监听器。
	useEffect(() => {
		if (!open) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			{/* 遮罩层：点击空白处等同于取消 */}
			<button
				type="button"
				aria-label="关闭弹窗"
				className="absolute inset-0 cursor-default bg-slate-900/40"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className={`relative z-10 w-full ${widthClassName} rounded-xl bg-white shadow-xl`}
			>
				<div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
					<h2 className="text-base font-semibold text-slate-800">{title}</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="关闭"
						title="关闭"
						className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="px-5 py-4">{children}</div>
				{footer ? (
					<div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
						{footer}
					</div>
				) : null}
			</div>
		</div>
	);
}

// 二次确认弹窗：用于删除等破坏性操作，danger 控制确认按钮是否为危险色。
export function ConfirmDialog({
	open,
	title,
	message,
	confirmText = "确定",
	cancelText = "取消",
	danger = false,
	loading = false,
	onConfirm,
	onCancel,
}: {
	open: boolean;
	title: string;
	message: ReactNode;
	confirmText?: string;
	cancelText?: string;
	danger?: boolean;
	loading?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<Modal
			open={open}
			title={title}
			onClose={onCancel}
			widthClassName="max-w-md"
			footer={
				<>
					<Button onClick={onCancel} disabled={loading}>
						{cancelText}
					</Button>
					<Button
						variant={danger ? "danger" : "primary"}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? "处理中..." : confirmText}
					</Button>
				</>
			}
		>
			<div className="text-sm text-slate-600">{message}</div>
		</Modal>
	);
}

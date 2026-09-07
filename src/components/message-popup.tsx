import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import type { CSSProperties } from "react"
import { createRoot, type Root } from "react-dom/client"

export type MessageType = "right" | "warn" | "wrong"

type MessagePopupProps = {
	type: MessageType
	message: string
}

// import { showMessage } from "../components/message-popup"
//
// showMessage("right", "操作成功") // 绿色
// showMessage("warn", "请检查输入内容") // 黄色
// showMessage("wrong", "操作失败") // 红色

const DURATION = 3000
const HOST_ID = "global-message-popup"

const messageStyles: Record<
	MessageType,
	{
		backgroundColor: string
		borderColor: string
		color: string
		icon: typeof CheckCircle2
	}
> = {
	right: {
		backgroundColor: "#ecfdf5",
		borderColor: "#a7f3d0",
		color: "#047857",
		icon: CheckCircle2,
	},
	warn: {
		backgroundColor: "#fffbeb",
		borderColor: "#fde68a",
		color: "#b45309",
		icon: AlertTriangle,
	},
	wrong: {
		backgroundColor: "#fef2f2",
		borderColor: "#fecaca",
		color: "#b91c1c",
		icon: XCircle,
	},
}

const popupStyle: CSSProperties = {
	position: "fixed",
	top: "10%",
	left: "50%",
	zIndex: 2147483647,
	display: "flex",
	alignItems: "center",
	gap: "12px",
	maxWidth: "calc(100vw - 32px)",
	padding: "12px 20px",
	transform: "translateX(-50%)",
	borderWidth: "1px",
	borderStyle: "solid",
	borderRadius: "8px",
	boxShadow: "0 10px 25px rgba(0, 0, 0, 0.16)",
	fontSize: "14px",
	fontWeight: 500,
	lineHeight: 1.5,
}

let popupRoot: Root | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

function MessagePopup({ type, message }: MessagePopupProps) {
	const { icon: Icon, ...colors } = messageStyles[type]

	return (
		<div
			role="alert"
			aria-live="assertive"
			style={{ ...popupStyle, ...colors }}
		>
			<Icon aria-hidden="true" size={20} style={{ flexShrink: 0 }} />
			<span style={{ overflowWrap: "anywhere" }}>{message}</span>
		</div>
	)
}

export function hideMessage() {
	if (closeTimer) {
		clearTimeout(closeTimer)
		closeTimer = null
	}

	popupRoot?.unmount()
	popupRoot = null

	if (typeof document !== "undefined") {
		document.getElementById(HOST_ID)?.remove()
	}
}

export function showMessage(type: MessageType, message: string) {
	if (typeof document === "undefined" || !document.body) return

	if (closeTimer) clearTimeout(closeTimer)

	let host = document.getElementById(HOST_ID)

	if (!host) {
		host = document.createElement("div")
		host.id = HOST_ID
		document.body.appendChild(host)
		popupRoot = createRoot(host)
	}

	popupRoot?.render(<MessagePopup type={type} message={message} />)
	closeTimer = setTimeout(hideMessage, DURATION)
}
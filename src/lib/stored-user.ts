import { useEffect, useState } from "react";

// Header/Sidebar 展示的用户信息（username/permissions）由登录成功后写入 localStorage。
// SSR 阶段没有 localStorage，渲染期直接读取会抛错；即使加兜底，服务端也渲染不出真实值，
// 客户端首屏读取还会造成 hydration 不一致。
// 因此统一在水合完成后（useEffect）读取。
function readStoredString(key: string, fallback: string): string {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as unknown;
		return typeof parsed === "string" ? parsed : fallback;
	} catch {
		return fallback;
	}
}

// 读取展示用用户信息：服务端与客户端首屏都返回空串（与 SSR 输出一致），
// 水合完成后填入真实值，避免 SSR 报错与 hydration mismatch。
// 返回空串时由调用方决定兜底文案（如「管理员」「—」）。
export function useStoredUser(): { username: string; permissions: string } {
	const [username, setUsername] = useState("");
	const [permissions, setPermissions] = useState("");

	useEffect(() => {
		setUsername(readStoredString("username", ""));
		setPermissions(readStoredString("permissions", ""));
	}, []);

	return { username, permissions };
}

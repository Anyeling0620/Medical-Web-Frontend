import { useEffect, useState } from "react";

// Header/Sidebar 展示与菜单可见性判定所需的登录用户信息，全部由登录成功后写入 localStorage。
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

// 读取字符串数组（完整权限编码列表）：非数组或含非字符串项时按空数组处理，
// 让菜单可见性判定退化为「只有不声明权限的菜单可见」，不会因为脏数据展示越权入口。
function readStoredStringArray(key: string): string[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is string => typeof item === "string");
	} catch {
		return [];
	}
}

// 读取医生编号（mis_user.ref_id -> doctor.id，契约 §6.10）：缺失或非正整数时返回 null，
// 表示该账号不是医生账号。
function readStoredNumber(key: string): number | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as unknown;
		if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 1) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export interface StoredUser {
	username: string;
	// 展示用：登录响应中的首个权限编码。
	permissions: string;
	// 授权判定用：完整权限编码列表。
	permissionList: string[];
	// 非 null 表示该账号绑定了医生。
	doctorId: number | null;
}

// 读取登录用户信息：服务端与客户端首屏都返回空值（与 SSR 输出一致），
// 水合完成后填入真实值，避免 SSR 报错与 hydration mismatch。
// 返回空串时由调用方决定兜底文案（如「管理员」「—」）。
export function useStoredUser(): StoredUser {
	const [username, setUsername] = useState("");
	const [permissions, setPermissions] = useState("");
	const [permissionList, setPermissionList] = useState<string[]>([]);
	const [doctorId, setDoctorId] = useState<number | null>(null);

	useEffect(() => {
		setUsername(readStoredString("username", ""));
		setPermissions(readStoredString("permissions", ""));
		setPermissionList(readStoredStringArray("permissionList"));
		setDoctorId(readStoredNumber("doctorId"));
	}, []);

	return { username, permissions, permissionList, doctorId };
}

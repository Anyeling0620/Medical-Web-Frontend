import { useEffect, useState } from "react";
import {
	EMPTY_USER_PROFILE,
	readStoredUserProfile,
	USER_PROFILE_CHANGED_EVENT,
	USER_PROFILE_KEY_PREFIX,
	type UserProfile,
} from "./user-profile";

// 读取当前登录账号的个性化信息（昵称 + 头像），供 Header / Sidebar / 设置页展示。
//
// 与 useStoredUser 一样统一在水合完成后（useEffect）读取 localStorage：
// SSR 阶段读不到值，渲染期直接读取还会造成 hydration 不一致。
// 另外订阅「保存事件」与跨标签页的 storage 事件，让各组件在设置页保存后立即刷新展示，
// 不必整页重新加载（父级布局路由不会随子路由重挂载）。
export function useUserProfile(username: string): UserProfile {
	const [profile, setProfile] = useState<UserProfile>(EMPTY_USER_PROFILE);

	useEffect(() => {
		// 读到的值与当前一致时返回原对象，避免无意义的整树重渲染。
		const sync = () => {
			const next = readStoredUserProfile(username);
			setProfile((current) =>
				current.displayName === next.displayName &&
				current.avatarDataUrl === next.avatarDataUrl
					? current
					: next,
			);
		};

		// 跨标签页同步：只关心本模块写入的键（key 为 null 表示整个存储被清空），
		// 否则其它键（如 React Query 的缓存）写入也会触发无意义的重读。
		const handleStorage = (event: StorageEvent) => {
			if (
				event.key !== null &&
				!event.key.startsWith(USER_PROFILE_KEY_PREFIX)
			) {
				return;
			}
			sync();
		};

		sync();
		window.addEventListener(USER_PROFILE_CHANGED_EVENT, sync);
		window.addEventListener("storage", handleStorage);

		return () => {
			window.removeEventListener(USER_PROFILE_CHANGED_EVENT, sync);
			window.removeEventListener("storage", handleStorage);
		};
	}, [username]);

	return profile;
}

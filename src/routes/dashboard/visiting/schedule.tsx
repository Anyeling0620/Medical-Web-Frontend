import { createFileRoute } from "@tanstack/react-router";

// 门诊日程表：当前无前端调用历史，仅保留占位路由，后续接入排班接口。
export const Route = createFileRoute("/dashboard/visiting/schedule")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/dashboard/visiting/schedule"!</div>;
}

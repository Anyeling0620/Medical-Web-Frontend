import { createFileRoute } from "@tanstack/react-router";

// 医生出诊表：当前无前端调用历史，仅保留占位路由，后续接入排班接口。
export const Route = createFileRoute("/dashboard/visiting/doctor-visits")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/dashboard/visiting/doctor-visits"!</div>;
}

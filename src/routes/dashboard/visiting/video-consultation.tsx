import { createFileRoute } from "@tanstack/react-router";

// 视频问诊：当前无前端调用历史，仅保留占位路由，后续接入问诊接口。
export const Route = createFileRoute("/dashboard/visiting/video-consultation")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/dashboard/visiting/video-consultation"!</div>;
}

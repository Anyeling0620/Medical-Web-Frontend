// AdminLayout.tsx
import { useState } from "react";
// ⚠️ 关键改动：从 tanstack 导入 Outlet
import { Outlet } from "@tanstack/react-router";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default function AdminLayout() {
    const [sidebarCollapse, setSidebarCollapse] = useState(false);

    return (
        <div
            className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-all duration-500"
        >
            <div className="flex h-screen overflow-hidden">
                <Sidebar
                    collapse={sidebarCollapse}
                    onToggle={() => setSidebarCollapse(!sidebarCollapse)}
                />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <Header
                        sidebarCollapse={sidebarCollapse}
                        onToggleSidebar={() => setSidebarCollapse(!sidebarCollapse)}
                    />
                    <main className="flex-1 overflow-y-auto bg-transparent">
                        <div className="p-6 space-y-6">
                            <Outlet />
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
import {
    BarChart3,
    ChevronDown,
    ListChecks,
    LayoutDashboard,
    Package,
    ShoppingCart,
    Zap,
} from "lucide-react";
import admin from "../../../public/admin.jpg";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const menuItems = [
    {
        id: "dashboard",
        icon: LayoutDashboard,
        label: "Dashboard",
        active: true,
        badge: "New",
        path: "/dashboard",
    },
    {
        id: "analytics",
        icon: BarChart3,
        label: "Analytics",
        path: "/analytics",
        submenu: [
            { id: "revenue", label: "Revenue", path: "/analytics/revenue" },
            {
                id: "sales-category",
                label: "Sales Category",
                path: "/analytics/sales-category",
            },
        ],
    },
    {
        id: "orders",
        icon: ShoppingCart,
        label: "Orders",
        path: "/orders",
    },
    {
        id: "products",
        icon: Package,
        label: "Products",
        path: "/products",
    },
    {
        id: "activities",
        icon: ListChecks,
        label: "Activities",
        path: "/activities",
    },
];

// @ts-ignore
export default function Sidebar({ collapse, onToggle }) {
    const location = useLocation();
    const navigate = useNavigate();
    const currentPath = location.pathname;
    console.log(collapse, onToggle, currentPath);
    const [expandedItems, setExpandedItems] = useState(new Set([""]));
    const toggleExpanded = (itemid) => {
        const newExpandedItems = new Set(expandedItems);
        if (newExpandedItems.has(itemid)) {
            newExpandedItems.delete(itemid);
        } else {
            newExpandedItems.add(itemid);
        }
        setExpandedItems(newExpandedItems);
    };
    return (
        <div
            className={`${collapse ? "w-20" : "w-62 md:w-72"} transition-all duration-200 ease-in-out bg-white/80 dark:bg-slate-900/80
  backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-700/50 flex
  flex-col relative z-10`}
        >
            {/* Logo */}
            <div className="p-6 border-b border-slate-200/50 dark:border-slate-700/50">
                <div className="flex items-center space-x-3">
                    <div
                        className="w-10 h-10 bg-linear-to-r from-blue-600 to-purple-600 rounded-xl
      flex items-center justify-center shadow-lg"
                    >
                        <Zap className="w-6 h-6 text-white"></Zap>
                    </div>
                    {/* Conditional Rendering */}
                    {!collapse && (
                        <div>
                            <h1 className="text-xl font-bold text-slate-800 dark:text-white">
                                Nexus
                            </h1>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                Admin Panel
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation  */}
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {menuItems.map((item) => (
                    <div key={item.id}>
                        <button
                            className={`w-full flex items-center ${collapse ? "justify-center" : "justify-between"} p-3 rounded-xl
            transition-all duration-200 ${currentPath === item.path || (item.submenu && currentPath.startsWith(item.path) && !expandedItems.has(item.id)) ? "bg-linear-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50"}`}
                            onClick={() => {
                                if (item.submenu) {
                                    toggleExpanded(item.id);
                                } else {
                                    navigate(item.path);
                                }
                            }}
                        >
                            <div
                                className={`${collapse ? "w-auto justify-center" : "w-full space-x-3"} flex items-center`}
                            >
                                <item.icon className="h-5 w-5 shrink-0" />
                                {/* Conditional Rendering */}
                                {!collapse && (
                                    <div className="w-full flex justify-between">
                                        <span className="font-medium ml-2">{item.label}</span>
                                        {item.badge && (
                                            <span className="px-2 py-1 text-xs bg-red-500 text-white rounded-full">
                        {item.badge}
                      </span>
                                        )}
                                        {item.count && (
                                            <span className="px-2 py-1 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full">
                        {item.count}
                      </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {!collapse && item.submenu ? (
                                <ChevronDown className={`w-4 h-4 ml-1 transition-transform`} />
                            ) : !collapse ? (
                                <div className="w-4 h-4 ml-1"></div>
                            ) : null}
                        </button>

                        {/* Submenu */}
                        {!collapse && item.submenu && expandedItems.has(item.id) && (
                            <div className="ml-8 mt-2 space-y-1">
                                {item.submenu.map((submenu) => (
                                    <button
                                        className={`w-full text-left p-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200
                  hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg transition-all ${currentPath === submenu.path ? "bg-linear-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50"}`}
                                        onClick={() => navigate(submenu.path)}
                                    >
                                        {submenu.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </nav>

            {!collapse && (
                <div className="p-4 border-t border-slate-200/50 dark:border-slate-700/50">
                    <div className="flex items-center space-x-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <img
                            src={admin}
                            alt="user"
                            className="w-10 h-10 rounded-full ring-2 ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                                Anyeling{" "}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {" "}
                                Administrator
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

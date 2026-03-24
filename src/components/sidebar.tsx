"use client";

import { useState, useEffect } from "react";
import { type NavPage } from "@/lib/types";
import {
  LayoutDashboard,
  FileText,
  AlertTriangle,
  Home,
  Radio,
  Users,
  Briefcase,
  Bell,
  MessageSquare,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { logout } from "@/lib/firebase/auth";
import { getRooms, getAllEmergencies } from "@/lib/firebase/firestore";

interface SidebarProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
}

const navSections = [
  {
    label: "운행",
    items: [
      { id: "dashboard" as NavPage, label: "대시보드", icon: LayoutDashboard },
      { id: "reports" as NavPage, label: "인원보고 조회", icon: FileText },
      { id: "emergency" as NavPage, label: "긴급호출 이력", icon: AlertTriangle },
    ],
  },
  {
    label: "관리",
    items: [
      { id: "rooms" as NavPage, label: "채팅방 관리", icon: Home },
      { id: "monitoring" as NavPage, label: "관제 시스템", icon: Radio },
      { id: "drivers" as NavPage, label: "기사·차량", icon: Users },
      { id: "companies" as NavPage, label: "소속·권한", icon: Briefcase },
      { id: "notice" as NavPage, label: "공지 발송", icon: Bell },
      { id: "chat" as NavPage, label: "채팅 모니터링", icon: MessageSquare },
    ],
  },
];

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { user } = useAuth();
  const [unprocessedEmergencyCount, setUnprocessedEmergencyCount] = useState(0);

  useEffect(() => {
    async function fetchUnprocessedCount() {
      try {
        const rooms = await getRooms();
        const normalRooms = rooms.filter((r) => r.id < 998);
        const emergencies = await getAllEmergencies(normalRooms, 200);
        const count = emergencies.filter((e) => e.status === "처리중").length;
        setUnprocessedEmergencyCount(count);
      } catch (error) {
        console.error("Error fetching emergency count:", error);
      }
    }
    fetchUnprocessedCount();
    const interval = setInterval(fetchUnprocessedCount, 60000);
    return () => clearInterval(interval);
  }, [currentPage]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <aside className="w-[220px] bg-surface border-r border-border flex flex-col shrink-0 z-10">
      <div className="h-14 px-[18px] flex items-center gap-2.5 border-b border-border">
        <div className="w-[30px] h-[30px] bg-accent rounded-lg flex items-center justify-center text-[13px] font-semibold text-white shrink-0 tracking-tight">
          CT
        </div>
        <div>
          <div className="text-sm font-semibold text-text-primary">크루톡</div>
          <div className="text-[10px] text-text-tertiary mt-px">관리자 콘솔</div>
        </div>
      </div>

      <nav className="flex-1 p-2.5 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="text-[10px] font-semibold tracking-wider uppercase text-text-tertiary px-2 pt-3 pb-1.5">
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-[13px] font-normal transition-all mb-px text-left ${
                    isActive
                      ? "bg-accent-light text-accent font-medium"
                      : "text-text-secondary hover:bg-bg hover:text-text-primary"
                  }`}
                >
                  <Icon
                    size={15}
                    className={`shrink-0 ${isActive ? "opacity-100" : "opacity-60"}`}
                  />
                  {item.label}
                  {item.id === "emergency" && unprocessedEmergencyCount > 0 && (
                    <span className="ml-auto text-[10px] font-semibold px-1.5 py-px rounded-full bg-danger-light text-danger">
                      {unprocessedEmergencyCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2.5">
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md">
          <div className="w-7 h-7 rounded-full bg-accent-light flex items-center justify-center text-[11px] font-semibold text-accent shrink-0">
            {user?.name?.charAt(0) || "관"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-text-primary truncate">
              {user?.name || "관리자"}
            </div>
            <div className="text-[10px] text-text-tertiary">
              {user?.role || "superAdmin"}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-md text-text-tertiary hover:text-danger hover:bg-danger-light transition-colors cursor-pointer"
            title="로그아웃"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

"use client";

import { useState } from "react";
import type { NavPage } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";
import LoginPage from "@/components/pages/login-page";
import DashboardPage from "@/components/pages/dashboard-page";
import ReportsPage from "@/components/pages/reports-page";
import EmergencyPage from "@/components/pages/emergency-page";
import RoomsPage from "@/components/pages/rooms-page";
import MonitoringPage from "@/components/pages/monitoring-page";
import DriversPage from "@/components/pages/drivers-page";
import CompaniesPage from "@/components/pages/companies-page";
import NoticePage from "@/components/pages/notice-page";
import ChatPage from "@/components/pages/chat-page";

const pageComponents: Record<NavPage, React.ComponentType> = {
  dashboard: DashboardPage,
  reports: ReportsPage,
  emergency: EmergencyPage,
  rooms: RoomsPage,
  monitoring: MonitoringPage,
  drivers: DriversPage,
  companies: CompaniesPage,
  notice: NoticePage,
  chat: ChatPage,
};

export default function Home() {
  const { user, loading, isAdminUser } = useAuth();
  const [currentPage, setCurrentPage] = useState<NavPage>("dashboard");

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-text-tertiary">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdminUser) {
    return <LoginPage />;
  }

  const PageComponent = pageComponents[currentPage];

  return (
    <div className="flex h-screen">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar currentPage={currentPage} onNavigate={setCurrentPage} />
        <main className="flex-1 p-[22px_24px] overflow-y-auto">
          <PageComponent />
        </main>
      </div>
    </div>
  );
}

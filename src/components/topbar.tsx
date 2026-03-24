"use client";

import { type NavPage } from "@/lib/types";
import { Download, Plus, Bell } from "lucide-react";

const pageNames: Record<NavPage, string> = {
  dashboard: "대시보드",
  reports: "인원보고 조회",
  emergency: "긴급호출 이력",
  rooms: "채팅방 관리",
  monitoring: "관제 시스템",
  drivers: "기사·차량",
  companies: "소속·권한",
  notice: "공지 발송",
  chat: "채팅 모니터링",
};

interface TopbarProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
}

export default function Topbar({ currentPage, onNavigate }: TopbarProps) {
  return (
    <header className="h-14 bg-surface border-b border-border px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] text-text-tertiary">크루톡</span>
        <span className="text-border-md text-base">/</span>
        <span className="text-[13px] font-medium text-text-primary">
          {pageNames[currentPage]}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-medium cursor-pointer border border-border-md bg-surface text-text-secondary transition-colors hover:bg-bg hover:text-text-primary">
          <Download size={12} />
          Excel 내보내기
        </button>
        <button
          onClick={() => onNavigate("notice")}
          className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-medium cursor-pointer border border-accent bg-accent text-white transition-colors hover:bg-accent-dark hover:border-accent-dark"
        >
          <Plus size={12} />
          공지 발송
        </button>
        <button className="relative w-8 h-8 flex items-center justify-center rounded-md border border-border-md bg-surface text-text-secondary transition-colors hover:bg-bg hover:text-text-primary cursor-pointer">
          <Bell size={15} />
          <div className="absolute top-[5px] right-[5px] w-1.5 h-1.5 rounded-full bg-danger border-[1.5px] border-surface" />
        </button>
      </div>
    </header>
  );
}

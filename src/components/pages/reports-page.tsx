"use client";

import { useState, useEffect } from "react";
import { Download, Search } from "lucide-react";
import { getRooms, getAllReportsByDate } from "@/lib/firebase/firestore";
import { getReportRate } from "@/lib/mock-data";
import type { Room, ReportMessage } from "@/lib/types";

const tabs = ["일반 인원보고", "출퇴근 통합보고", "운행 집계"];
const shifts = ["전체", "출근", "퇴근", "야간"];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reports, setReports] = useState<ReportMessage[]>([]);
  
  const getTodayDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const [dateFilter, setDateFilter] = useState(getTodayDate());
  const [routeFilter, setRouteFilter] = useState("전체 노선");
  const [shiftFilter, setShiftFilter] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const roomsData = await getRooms();
        setRooms(roomsData);
        
        const normalRooms = roomsData.filter((r) => r.id < 998);
        const reportsData = await getAllReportsByDate(dateFilter, normalRooms);
        setReports(reportsData);
      } catch (error) {
        console.error("Error loading reports:", error);
      }
    }
    loadData();
  }, [dateFilter]);

  const uniqueRoutes = ["전체 노선", ...new Set(reports.map((r) => r.route))];

  const filteredReports = reports.filter((r) => {
    if (r.date !== dateFilter) return false;
    if (routeFilter !== "전체 노선" && r.route !== routeFilter) return false;
    if (shiftFilter !== "전체" && r.reportData?.type !== shiftFilter) return false;
    if (searchQuery && !r.name.includes(searchQuery) && !r.route.includes(searchQuery)) return false;
    return true;
  });

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            인원보고 조회
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            날짜·노선별 필터링 및 Excel 내보내기
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-medium cursor-pointer border border-accent bg-accent text-white transition-colors hover:bg-accent-dark">
          <Download size={12} />
          Excel 내보내기
        </button>
      </div>

      <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
        {/* Tabs */}
        <div className="flex gap-0.5 mb-3.5 border-b border-border pb-0">
          {tabs.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`px-3.5 py-2 text-xs font-medium cursor-pointer border-b-2 mb-[-1px] transition-all ${
                activeTab === i
                  ? "text-accent border-accent"
                  : "text-text-tertiary border-transparent hover:text-text-primary"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-3.5 flex-wrap">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-border-md rounded-md font-sans text-xs text-text-primary outline-none focus:border-accent"
          />
          <select
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-border-md rounded-md font-sans text-xs text-text-secondary outline-none bg-surface focus:border-accent"
          >
            {uniqueRoutes.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-border-md rounded-md font-sans text-xs text-text-secondary outline-none bg-surface focus:border-accent"
          >
            {shifts.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="기사명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-border-md rounded-md font-sans text-xs text-text-primary outline-none focus:border-accent w-[160px]"
            />
          </div>
        </div>

        {/* Table */}
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["시간", "기사명", "노선", "세부노선", "구분", "정원", "탑승인원", "탑승률", "상태"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wide border-b border-border bg-bg"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filteredReports.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-xs text-text-tertiary"
                >
                  해당 조건의 인원보고가 없습니다.
                </td>
              </tr>
            ) : (
              filteredReports.map((r) => {
                if (!r.reportData) return null;
                const rate = getReportRate(r.reportData.count, r.reportData.maxCount);
                const rateColor =
                  rate >= 90
                    ? "text-accent"
                    : rate >= 70
                      ? "text-warning"
                      : "text-danger";
                const statusLabel =
                  rate >= 95 ? "만석" : rate >= 80 ? "정상" : rate >= 60 ? "저조" : "미달";
                const statusClass =
                  rate >= 80
                    ? "bg-accent-light text-accent"
                    : rate >= 60
                      ? "bg-warning-light text-warning"
                      : "bg-danger-light text-danger";

                return (
                  <tr key={r.id} className="hover:bg-bg transition-colors">
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      {r.time}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border font-medium">
                      {r.name}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      {r.route}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border text-text-tertiary">
                      {r.subRoute || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      {r.reportData.type}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      {r.reportData.maxCount}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border font-medium">
                      {r.reportData.count}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      <span className={`font-medium ${rateColor}`}>{rate}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      <span
                        className={`text-[10px] font-medium px-2 py-[3px] rounded-full ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              }).filter(Boolean)
            )}
          </tbody>
        </table>

        {filteredReports.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-text-tertiary">
              총 {filteredReports.length}건의 보고
            </span>
            <span className="text-[11px] text-text-tertiary">
              총 탑승인원:{" "}
              <strong className="text-text-primary">
                {filteredReports.reduce((s, r) => s + (r.reportData?.count || 0), 0)}명
              </strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Edit2 } from "lucide-react";
import { getDrivers, getAllReportsByDate } from "@/lib/firebase/firestore";
import { getRooms } from "@/lib/firebase/firestore";
import { getAvatarTheme } from "@/lib/mock-data";
import type { Driver, Room, ReportMessage } from "@/lib/types";

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [reports, setReports] = useState<ReportMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<"drivers" | "vehicles">("drivers");
  const [showAddModal, setShowAddModal] = useState(false);

  const getTodayDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [driversData, roomsData] = await Promise.all([
          getDrivers(),
          getRooms(),
        ]);
        setDrivers(driversData);
        
        const normalRooms = roomsData.filter((r) => r.id < 998);
        // 최근 7일 인원보고 조회 (최신 보고 기반 차량번호 노출용)
        const datePromises = Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return getAllReportsByDate(dateStr, normalRooms);
        });
        const results = await Promise.all(datePromises);
        setReports(results.flat());
      } catch (error) {
        console.error("Error loading drivers:", error);
      }
    }
    loadData();
  }, []);

  // 기사별 최신 인원보고의 차량번호 (date+time 기준 내림차순)
  const latestCarByDriver = reports
    .filter((r) => r.car)
    .sort((a, b) => {
      const dateCompare = (b.date || "").localeCompare(a.date || "");
      if (dateCompare !== 0) return dateCompare;
      return (b.time || "").localeCompare(a.time || "");
    })
    .reduce<Record<string, string>>((acc, r) => {
      if (!acc[r.name]) acc[r.name] = r.car;
      return acc;
    }, {});

  const getDisplayCar = (driver: Driver) =>
    driver.car || latestCarByDriver[driver.name] || null;

  const filteredDrivers = drivers.filter((d) => {
    const displayCar = getDisplayCar(d);
    return (
      d.name.includes(searchQuery) ||
      d.company.includes(searchQuery) ||
      (displayCar && displayCar.includes(searchQuery))
    );
  });

  const filteredVehicles: any[] = [];

  const todayReports = reports.filter((r) => r.date === getTodayDate());

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            기사·차량 관리
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            기사 등록·수정·삭제, 역할 관리
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-medium cursor-pointer border border-accent bg-accent text-white transition-colors hover:bg-accent-dark"
        >
          <Plus size={12} />
          기사 등록
        </button>
      </div>

      <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
        {/* Tabs */}
        <div className="flex gap-0.5 mb-3.5 border-b border-border pb-0">
          <button
            onClick={() => setTab("drivers")}
            className={`px-3.5 py-2 text-xs font-medium cursor-pointer border-b-2 mb-[-1px] transition-all ${
              tab === "drivers"
                ? "text-accent border-accent"
                : "text-text-tertiary border-transparent hover:text-text-primary"
            }`}
          >
            기사 목록
          </button>
          <button
            onClick={() => setTab("vehicles")}
            className={`px-3.5 py-2 text-xs font-medium cursor-pointer border-b-2 mb-[-1px] transition-all ${
              tab === "vehicles"
                ? "text-accent border-accent"
                : "text-text-tertiary border-transparent hover:text-text-primary"
            }`}
          >
            차량 목록
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3.5">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            placeholder={
              tab === "drivers"
                ? "이름, 차량번호, 소속 검색..."
                : "차량번호, 기사명, 차종 검색..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-border-md rounded-md font-sans text-[13px] text-text-primary outline-none focus:border-accent bg-surface"
          />
        </div>

        {tab === "drivers" ? (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["이름", "전화번호", "소속", "차량번호", "역할", "상태", "관리"].map(
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
              {filteredDrivers.map((driver) => {
                const theme = getAvatarTheme(driver.name);
            const report = todayReports.find((r) => r.name === driver.name);
            const status = report && report.reportData ? report.reportData.type : "미보고";

                const roleStyle =
                  driver.role === "manager"
                    ? "bg-blue-light text-blue"
                    : driver.role === "superAdmin"
                      ? "bg-accent-light text-accent"
                      : "bg-gray-100 text-text-secondary";

                const statusStyle =
                  status === "미보고"
                    ? "bg-danger-light text-danger"
                    : "bg-accent-light text-accent";

                return (
                  <tr key={driver.id} className="hover:bg-bg transition-colors">
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold"
                          style={{ background: theme.bg, color: theme.fg }}
                        >
                          {driver.name.charAt(0)}
                        </div>
                        <span className="font-medium">{driver.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border text-text-secondary whitespace-nowrap">
                      {driver.phone}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      {driver.company}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border font-mono">
                      {getDisplayCar(driver) || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      <span
                        className={`text-[10px] font-medium px-[7px] py-[2px] rounded ${roleStyle}`}
                      >
                        {driver.role || "driver"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      <span
                        className={`text-[10px] font-medium px-2 py-[3px] rounded-full ${statusStyle}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      <button className="text-accent hover:opacity-70 transition-opacity cursor-pointer">
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[
                  "차량번호",
                  "차종",
                  "정원",
                  "배정 기사",
                  "검사 만료일",
                  "비고",
                  "관리",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wide border-b border-border bg-bg"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-xs text-text-tertiary">
                    차량 정보가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((v) => {
                  const expDate = new Date(v.inspectionExpiry);
                const now = new Date("2026-03-20");
                const diffDays = Math.ceil(
                  (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
                );
                const isExpiring = diffDays < 90;

                return (
                  <tr key={v.id} className="hover:bg-bg transition-colors">
                    <td className="px-3 py-2.5 text-xs border-b border-border font-mono font-medium">
                      {v.carNumber}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      {v.model}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      {v.capacity}인승
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border font-medium">
                      {v.driver}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      <span
                        className={
                          isExpiring
                            ? "text-danger font-medium"
                            : "text-text-secondary"
                        }
                      >
                        {v.inspectionExpiry}
                        {isExpiring && " ⚠️"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border text-text-tertiary">
                      {v.note || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      <button className="text-accent hover:opacity-70 transition-opacity cursor-pointer">
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Driver Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-[480px] shadow-lg animate-fade-in">
            <h2 className="text-base font-semibold text-text-primary mb-4">
              새 기사 등록
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                    이름
                  </label>
                  <input
                    type="text"
                    placeholder="홍길동"
                    className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                    전화번호
                  </label>
                  <input
                    type="text"
                    placeholder="010-1234-5678"
                    className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                    소속
                  </label>
                  <select className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent bg-surface">
                    <option>A업체</option>
                    <option>B업체</option>
                    <option>C업체</option>
                    <option>D업체</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                    역할
                  </label>
                  <select className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent bg-surface">
                    <option value="driver">driver</option>
                    <option value="manager">manager</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  차량번호
                </label>
                <input
                  type="text"
                  placeholder="경기 78사 2918호"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  비고
                </label>
                <input
                  type="text"
                  placeholder="특이사항"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-border-md bg-surface text-text-secondary hover:bg-bg cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-accent bg-accent text-white hover:bg-accent-dark cursor-pointer"
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

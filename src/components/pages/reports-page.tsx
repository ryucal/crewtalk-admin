"use client";

import { useState, useEffect, useMemo } from "react";
import { Download, Search } from "lucide-react";
import { getRooms, getReports, getDrivers, getCompanies } from "@/lib/firebase/firestore";
import { getReportRate } from "@/lib/mock-data";
import type { Room, ReportMessage } from "@/lib/types";

const tabs = ["통합 인원보고", "노선별 인원보고", "기사별 인원보고", "업체별 인원보고"];
const shifts = ["전체", "출근", "퇴근", "야간"];

const ALL_ROUTES = "전체 노선";
const ALL_DETAIL = "전체";
const ALL_SUB_ROUTE = "전체 세부노선";

type ReportWithMeta = ReportMessage & {
  companyLabel: string;
  roomId: string;
  roomName: string;
  roomCompanies: string[];
};

type TableRow = { key: string; r: ReportWithMeta };

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState(0);

  const getTodayDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };

  const [dateFilter, setDateFilter] = useState(getTodayDate());
  /** 통합 탭: 노선 필터 */
  const [routeFilter, setRouteFilter] = useState(ALL_ROUTES);
  /** 노선별·기사별·업체별 탭: 두 번째 드롭다운 */
  const [detailFilter, setDetailFilter] = useState(ALL_DETAIL);
  /** 노선별 탭: 세부노선만 (노선 드롭다운 없음 → 항상 전체 노선) */
  const [subRouteFilterTab1, setSubRouteFilterTab1] = useState(ALL_SUB_ROUTE);
  const [shiftFilter, setShiftFilter] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [reports, setReports] = useState<ReportWithMeta[]>([]);
  const [normalRooms, setNormalRooms] = useState<Room[]>([]);
  const [driverNames, setDriverNames] = useState<string[]>([]);
  const [companyNames, setCompanyNames] = useState<string[]>([]);

  useEffect(() => {
    setRouteFilter(ALL_ROUTES);
    setDetailFilter(ALL_DETAIL);
    setSubRouteFilterTab1(ALL_SUB_ROUTE);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 1) return;
    setSubRouteFilterTab1(ALL_SUB_ROUTE);
  }, [detailFilter, activeTab]);

  useEffect(() => {
    async function loadRoomsDriversCompanies() {
      try {
        const roomsData = await getRooms();
        const normal = roomsData.filter((r) => r.id < 998);
        setNormalRooms(normal);

        const [driversData, companiesData] = await Promise.all([getDrivers(), getCompanies()]);
        setDriverNames(
          [...new Set(driversData.map((d) => d.name).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b, "ko")
          )
        );
        setCompanyNames(
          [...new Set(companiesData.map((c) => c.name).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b, "ko")
          )
        );
      } catch (e) {
        console.error("Error loading rooms/drivers/companies:", e);
      }
    }
    loadRoomsDriversCompanies();
  }, []);

  useEffect(() => {
    async function loadReports() {
      try {
        const list: ReportWithMeta[] = [];
        for (const room of normalRooms) {
          const batch = await getReports(room.id.toString(), dateFilter);
          const companyLabel =
            room.companies && room.companies.length > 0
              ? room.companies.join(" · ")
              : room.name || `채팅방 ${room.id}`;
          const roomName = room.name?.trim() || `채팅방 ${room.id}`;
          const roomCompanies = room.companies ? [...room.companies] : [];
          for (const r of batch) {
            list.push({
              ...r,
              companyLabel,
              roomId: String(room.id),
              roomName,
              roomCompanies,
            });
          }
        }
        setReports(list);
      } catch (error) {
        console.error("Error loading reports:", error);
      }
    }
    if (normalRooms.length > 0) {
      loadReports();
    } else {
      setReports([]);
    }
  }, [dateFilter, normalRooms]);

  const routeOptions = useMemo(
    () => [ALL_ROUTES, ...[...new Set(reports.map((r) => r.route).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"))],
    [reports]
  );

  /** 노선별: 소속·권한에 등록된 채팅방 이름(방 목록 기준) */
  const chatRoomOptions = useMemo(() => {
    const names = normalRooms.map((r) => r.name?.trim()).filter(Boolean) as string[];
    return [ALL_DETAIL, ...[...new Set(names)].sort((a, b) => a.localeCompare(b, "ko"))];
  }, [normalRooms]);

  const driverOptions = useMemo(() => [ALL_DETAIL, ...driverNames], [driverNames]);
  const companyOptions = useMemo(() => [ALL_DETAIL, ...companyNames], [companyNames]);

  /** 노선별 탭: 날짜·채팅방까지 반영한 보고(노선 옵션 산출용) */
  const tab1BaseReports = useMemo(() => {
    return reports.filter((r) => {
      if (r.date !== dateFilter) return false;
      if (detailFilter !== ALL_DETAIL && r.roomName !== detailFilter) return false;
      return true;
    });
  }, [reports, dateFilter, detailFilter]);

  const selectedRoomForTab1 = useMemo(() => {
    if (detailFilter === ALL_DETAIL) return undefined;
    const want = detailFilter.trim();
    return normalRooms.find((room) => (room.name?.trim() || "") === want);
  }, [normalRooms, detailFilter]);

  const tab1SubRouteOptions = useMemo(() => {
    const fromReports = tab1BaseReports
      .map((r) => (r.subRoute || "").trim())
      .filter(Boolean);
    const fromRoom =
      selectedRoomForTab1?.subRoutes?.map((s) => String(s).trim()).filter(Boolean) ?? [];
    return [...new Set([...fromRoom, ...fromReports])].sort((a, b) => a.localeCompare(b, "ko"));
  }, [tab1BaseReports, selectedRoomForTab1]);

  const showTab1SubRouteSelect = activeTab === 1 && tab1SubRouteOptions.length > 0;

  const tab1SubRouteOptionsSig = useMemo(
    () => tab1SubRouteOptions.join("\u001f"),
    [tab1SubRouteOptions]
  );

  useEffect(() => {
    if (activeTab !== 1) return;
    if (subRouteFilterTab1 !== ALL_SUB_ROUTE && !tab1SubRouteOptions.includes(subRouteFilterTab1)) {
      setSubRouteFilterTab1(ALL_SUB_ROUTE);
    }
  }, [activeTab, tab1SubRouteOptionsSig, subRouteFilterTab1]); // eslint-disable-line react-hooks/exhaustive-deps -- Sig가 세부노선 옵션 내용과 동기화

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (r.date !== dateFilter) return false;

      if (activeTab === 0) {
        if (routeFilter !== ALL_ROUTES && r.route !== routeFilter) return false;
      } else if (activeTab === 1) {
        if (detailFilter !== ALL_DETAIL && r.roomName !== detailFilter) return false;
        if (subRouteFilterTab1 !== ALL_SUB_ROUTE) {
          const sr = (r.subRoute || "").trim();
          if (sr !== subRouteFilterTab1) return false;
        }
      } else if (activeTab === 2) {
        if (detailFilter !== ALL_DETAIL && r.name !== detailFilter) return false;
      } else if (activeTab === 3) {
        if (detailFilter !== ALL_DETAIL) {
          const inCompanies = r.roomCompanies.some((c) => c === detailFilter);
          if (!inCompanies) return false;
        }
      }

      if (shiftFilter !== "전체" && r.reportData?.type !== shiftFilter) return false;
      if (
        searchQuery &&
        !r.name.includes(searchQuery) &&
        !r.route.includes(searchQuery) &&
        !r.companyLabel.includes(searchQuery) &&
        !r.roomName.includes(searchQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [
    reports,
    dateFilter,
    activeTab,
    routeFilter,
    detailFilter,
    subRouteFilterTab1,
    shiftFilter,
    searchQuery,
  ]);

  const tableRows: TableRow[] = useMemo(() => {
    const sorted = [...filteredReports].sort((a, b) => {
      if (activeTab === 1) {
        const cr = a.route.localeCompare(b.route, "ko");
        if (cr !== 0) return cr;
        const csr = (a.subRoute || "").localeCompare(b.subRoute || "", "ko");
        if (csr !== 0) return csr;
      } else if (activeTab === 2) {
        const c = a.name.localeCompare(b.name, "ko");
        if (c !== 0) return c;
      } else if (activeTab === 3) {
        const c = a.companyLabel.localeCompare(b.companyLabel, "ko");
        if (c !== 0) return c;
        const cr = a.route.localeCompare(b.route, "ko");
        if (cr !== 0) return cr;
      } else {
        const cr = a.route.localeCompare(b.route, "ko");
        if (cr !== 0) return cr;
      }
      return (a.time || "").localeCompare(b.time || "", "ko");
    });

    return sorted.map((r) => ({ key: r.id, r }));
  }, [filteredReports, activeTab]);

  const searchPlaceholder =
    activeTab === 2
      ? "기사명 검색..."
      : activeTab === 3
        ? "업체명·노선 검색..."
        : activeTab === 1
          ? "기사명·노선 검색..."
          : "기사명·노선·채팅방 검색...";

  const secondarySelectLabel =
    activeTab === 1 ? "채팅방" : activeTab === 2 ? "기사" : activeTab === 3 ? "업체" : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">인원보고 조회</h1>
          <p className="text-xs text-text-tertiary mt-1">
            통합·노선·기사·업체 단위로 조회 · 날짜·필터 및 Excel보내기
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-medium cursor-pointer border border-accent bg-accent text-white transition-colors hover:bg-accent-dark">
          <Download size={12} />
          Excel보내기
        </button>
      </div>

      <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
        <div className="flex gap-0.5 mb-3.5 border-b border-border pb-0 flex-wrap">
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

        <div className="flex gap-2 mb-3.5 flex-wrap items-center">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-border-md rounded-md font-sans text-xs text-text-primary outline-none focus:border-accent"
          />

          {activeTab === 0 ? (
            <label className="flex items-center gap-1.5 text-[11px] text-text-secondary shrink-0">
              <span className="whitespace-nowrap">노선</span>
              <select
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-border-md rounded-md font-sans text-xs text-text-secondary outline-none bg-surface focus:border-accent min-w-[140px]"
              >
                {routeOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="flex items-center gap-1.5 text-[11px] text-text-secondary shrink-0">
                <span className="whitespace-nowrap">{secondarySelectLabel}</span>
                <select
                  value={detailFilter}
                  onChange={(e) => setDetailFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-border-md rounded-md font-sans text-xs text-text-secondary outline-none bg-surface focus:border-accent min-w-[160px] max-w-[240px]"
                >
                  {(activeTab === 1 ? chatRoomOptions : activeTab === 2 ? driverOptions : companyOptions).map(
                    (opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    )
                  )}
                </select>
              </label>
              {activeTab === 1 && (
                <>
                  {showTab1SubRouteSelect && (
                    <label className="flex items-center gap-1.5 text-[11px] text-text-secondary shrink-0">
                      <span className="whitespace-nowrap">세부 노선</span>
                      <select
                        value={subRouteFilterTab1}
                        onChange={(e) => setSubRouteFilterTab1(e.target.value)}
                        className="px-2.5 py-1.5 border border-border-md rounded-md font-sans text-xs text-text-secondary outline-none bg-surface focus:border-accent min-w-[130px] max-w-[200px]"
                      >
                        <option value={ALL_SUB_ROUTE}>{ALL_SUB_ROUTE}</option>
                        {tab1SubRouteOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
            </>
          )}

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
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-border-md rounded-md font-sans text-xs text-text-primary outline-none focus:border-accent w-[180px]"
            />
          </div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["시간", "기사명", "노선", "세부노선", "구분", "탑승인원", "탑승률", "상태"].map((h) => (
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
            {filteredReports.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-xs text-text-tertiary">
                  해당 조건의 인원보고가 없습니다.
                </td>
              </tr>
            ) : (
              tableRows.map((item) => {
                const r = item.r;
                if (!r.reportData) return null;
                const rate = getReportRate(r.reportData.count, r.reportData.maxCount);
                const rateColor =
                  rate >= 90 ? "text-accent" : rate >= 70 ? "text-warning" : "text-danger";
                const statusLabel =
                  rate >= 95 ? "만석" : rate >= 80 ? "정상" : rate >= 60 ? "저조" : "미달";
                const statusClass =
                  rate >= 80
                    ? "bg-accent-light text-accent"
                    : rate >= 60
                      ? "bg-warning-light text-warning"
                      : "bg-danger-light text-danger";

                return (
                  <tr key={item.key} className="hover:bg-bg transition-colors">
                    <td className="px-3 py-2.5 text-xs border-b border-border">{r.time}</td>
                    <td className="px-3 py-2.5 text-xs border-b border-border font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">{r.route}</td>
                    <td className="px-3 py-2.5 text-xs border-b border-border text-text-tertiary">
                      {r.subRoute || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">{r.reportData.type}</td>
                    <td className="px-3 py-2.5 text-xs border-b border-border font-medium">
                      {r.reportData.count}
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      <span className={`font-medium ${rateColor}`}>{rate}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs border-b border-border">
                      <span className={`text-[10px] font-medium px-2 py-[3px] rounded-full ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              })
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

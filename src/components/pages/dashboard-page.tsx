"use client";

import { useEffect, useState } from "react";
import { Sunrise, Sunset, Clock, ClipboardList, X } from "lucide-react";
import { getRooms, getDrivers, getCompanies, getAllReportsByDate, getAllEmergencies } from "@/lib/firebase/firestore";
import { getMessages } from "@/lib/firebase/firestore";
import { formatDate } from "@/lib/mock-data";
import WorkspaceCalendarPanel from "@/components/workspace-calendar-panel";
import type { Room, Driver, Company, ReportMessage, EmergencyMessage, ChatMessage } from "@/lib/types";

function StatCard({
  label,
  value,
  valueColor,
  sub,
  chip,
  chipColor,
  icon,
  iconBg,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  sub: string;
  chip?: string;
  chipColor?: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">
          {label}
        </span>
        <div
          className="w-[30px] h-[30px] rounded-lg flex items-center justify-center"
          style={{ background: iconBg }}
        >
          {icon}
        </div>
      </div>
      <div
        className="text-[28px] font-semibold leading-none tracking-tight mb-1.5"
        style={{ color: valueColor }}
      >
        {value}
      </div>
      {(sub || chip) && (
        <div className="text-[11px] text-text-tertiary flex items-center gap-1">
          {sub}
          {chip && (
            <span
              className="text-[10px] px-1.5 py-px rounded-full font-medium"
              style={{ background: chipColor ? undefined : "#e8f5ee", color: chipColor || "#1a7f5a" }}
            >
              {chip}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function RouteBar({
  name,
  morning,
  evening,
  total,
  maxTotal,
}: {
  name: string;
  morning: number;
  evening: number;
  total: number;
  maxTotal: number;
}) {
  const morningPct = maxTotal > 0 ? (morning / maxTotal) * 100 : 0;
  const eveningPct = maxTotal > 0 ? (evening / maxTotal) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5 py-[8px] border-b border-border last:border-b-0">
      <span className="text-xs text-text-primary min-w-[110px] font-medium truncate">{name}</span>
      <div className="flex-1 flex flex-col gap-[3px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-accent font-medium w-[14px] shrink-0">출</span>
          <div className="flex-1 h-[4px] bg-bg rounded-full overflow-hidden">
            <div
              className="h-full rounded-full animate-bar-grow"
              style={{ width: `${morningPct}%`, background: "var(--color-accent)" }}
            />
          </div>
          <span className="text-[10px] text-accent font-semibold min-w-[28px] text-right">
            {morning > 0 ? morning : "—"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-blue font-medium w-[14px] shrink-0">퇴</span>
          <div className="flex-1 h-[4px] bg-bg rounded-full overflow-hidden">
            <div
              className="h-full rounded-full animate-bar-grow"
              style={{ width: `${eveningPct}%`, background: "var(--color-blue)" }}
            />
          </div>
          <span className="text-[10px] text-blue font-semibold min-w-[28px] text-right">
            {evening > 0 ? evening : "—"}
          </span>
        </div>
      </div>
      <span className="text-[11px] text-text-primary min-w-[40px] text-right font-semibold">
        {total}명
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const [liveTime, setLiveTime] = useState("");
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [reports, setReports] = useState<ReportMessage[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyMessage[]>([]);
  const [notices, setNotices] = useState<ChatMessage[]>([]);

  const getTodayDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    function update() {
      const now = new Date();
      const days = ["일", "월", "화", "수", "목", "금", "토"];
      const d = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]}요일`;
      const ampm = now.getHours() < 12 ? "오전" : "오후";
      const hh = now.getHours() % 12 || 12;
      const mm = String(now.getMinutes()).padStart(2, "0");
      setLiveTime(`${d} · ${ampm} ${hh}:${mm} 기준 실시간`);
    }
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [roomsData, driversData, companiesData] = await Promise.all([
          getRooms(),
          getDrivers(),
          getCompanies(),
        ]);

        setRooms(roomsData);
        setDrivers(driversData);
        setCompanies(companiesData);

        const normalRooms = roomsData.filter((r) => r.id < 998);

        // 최근 7일 인원보고 (기사·차량관리와 동일한 차량번호 노출용)
        const datePromises = Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return getAllReportsByDate(dateStr, normalRooms);
        });
        const reportsData = (await Promise.all(datePromises)).flat();
        setReports(reportsData);

        const emergenciesData = await getAllEmergencies(normalRooms, 10);
        setEmergencies(emergenciesData);

        const noticePromises = normalRooms.map((room) =>
          getMessages(room.id.toString(), 50).then((msgs) =>
            msgs.filter((m) => m.type === "notice")
          )
        );
        const allNotices = (await Promise.all(noticePromises)).flat();
        allNotices.sort((a, b) => {
          const dateA = new Date(`${a.date} ${a.time}`).getTime();
          const dateB = new Date(`${b.date} ${b.time}`).getTime();
          return dateB - dateA;
        });
        setNotices(allNotices.slice(0, 4));
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      }
    }
    loadData();
  }, []);

  const today = getTodayDate();
  const todayReports = reports.filter((r) => r.date === today);

  const morningReports = todayReports.filter((r) => r.reportData?.type === "출근");
  const eveningReports = todayReports.filter((r) => r.reportData?.type === "퇴근");
  const totalMorning = morningReports.reduce((s, r) => s + (r.reportData?.count || 0), 0);
  const totalEvening = eveningReports.reduce((s, r) => s + (r.reportData?.count || 0), 0);
  const totalAllReports = todayReports.reduce((s, r) => s + (r.reportData?.count || 0), 0);

  const peakTime = todayReports.length > 0
    ? todayReports.reduce((max, r) => {
        return (r.reportData?.count || 0) > (max.reportData?.count || 0) ? r : max;
      }).time
    : "—";

  const normalRooms = rooms.filter((r) => r.id < 998);
  const routeData = normalRooms.map((room) => {
    const roomReports = todayReports.filter((r) => r.route === room.name);
    const morning = roomReports
      .filter((r) => r.reportData?.type === "출근")
      .reduce((s, r) => s + (r.reportData?.count || 0), 0);
    const evening = roomReports
      .filter((r) => r.reportData?.type === "퇴근")
      .reduce((s, r) => s + (r.reportData?.count || 0), 0);
    const total = morning + evening;
    return { name: room.name, morning, evening, total };
  }).sort((a, b) => b.total - a.total);

  const maxRouteTotal = Math.max(...routeData.map((r) => r.total), 1);
  const topRoutes = routeData.slice(0, 6);
  const remainingRoutes = routeData.slice(6);

  const companyStats = companies.map((c) => ({
    name: c.name,
    count: drivers.filter((d) => d.company === c.name).length,
  }));
  const maxCompanyCount = Math.max(...companyStats.map((c) => c.count), 1);

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            운행 현황 대시보드
          </h1>
          <p className="text-xs text-text-tertiary mt-1">{liveTime}</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-3 mb-[18px]">
        <StatCard
          label="총 출근"
          value={`${totalMorning}명`}
          valueColor="var(--color-accent)"
          sub=""
          icon={<Sunrise size={14} color="#1a7f5a" />}
          iconBg="var(--color-accent-light)"
        />
        <StatCard
          label="총 퇴근"
          value={`${totalEvening}명`}
          valueColor="var(--color-blue)"
          sub=""
          icon={<Sunset size={14} color="#2563eb" />}
          iconBg="var(--color-blue-light)"
        />
        <StatCard
          label="피크 시간"
          value={peakTime}
          valueColor="var(--color-warning)"
          sub="가장 많은 탑승 보고 시간"
          icon={<Clock size={14} color="#d97706" />}
          iconBg="var(--color-warning-light)"
        />
        <StatCard
          label="오늘 총 인원 보고"
          value={`${todayReports.length}건`}
          sub={`총 ${totalAllReports}명 탑승`}
          chip={`${normalRooms.length}개 노선`}
          icon={<ClipboardList size={14} color="#6b7280" />}
          iconBg="#f3f4f6"
        />
      </div>

      {/* Mid Grid — 팀 업무 달력 2/3, 노선별 탑승 현황 1/3 */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3.5 mb-3.5">
        <WorkspaceCalendarPanel />

        {/* Route Status */}
        <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm min-w-0">
          <div className="flex items-center justify-between mb-3.5 gap-2">
            <span className="text-[13px] font-semibold text-text-primary min-w-0">
              노선별 탑승 현황
              <span className="text-[11px] font-normal text-text-tertiary ml-1.5">
                상위 6개 노선
              </span>
            </span>
            {remainingRoutes.length > 0 && (
              <button
                onClick={() => setShowAllRoutes(true)}
                className="text-[11px] text-accent font-medium cursor-pointer hover:opacity-70 transition-opacity shrink-0"
              >
                전체 보기 ({routeData.length}개) →
              </button>
            )}
          </div>
          {topRoutes.map((r) => (
            <RouteBar key={r.name} {...r} maxTotal={maxRouteTotal} />
          ))}
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-3 gap-3.5">
        {/* Recent Notices */}
        <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-[13px] font-semibold text-text-primary">
              최근 공지
            </span>
            <span className="text-[11px] text-accent font-medium cursor-pointer hover:opacity-70 transition-opacity">
              발송하기 →
            </span>
          </div>
          {notices.length > 0 ? (
            notices.map((notice, i) => (
              <div
                key={notice.id}
                className="flex gap-2.5 py-2 border-b border-border last:border-b-0"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full mt-[5px] shrink-0"
                  style={{
                    background:
                      i === 0
                        ? "var(--color-accent)"
                        : i === 1
                          ? "var(--color-warning)"
                          : "#d1d5db",
                  }}
                />
                <div>
                  <div className="text-xs text-text-primary leading-snug">
                    {notice.text && notice.text.length > 20
                      ? notice.text.slice(0, 20) + "..."
                      : notice.text || "공지"}
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">
                    {formatDate(notice.date)} {notice.time} · {notice.name}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-4 text-center text-xs text-text-tertiary">
              최근 공지가 없습니다
            </div>
          )}
        </div>

        {/* Emergency */}
        <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-[13px] font-semibold text-text-primary">
              긴급호출
            </span>
            <span className="text-[11px] text-accent font-medium cursor-pointer hover:opacity-70 transition-opacity">
              이력 보기 →
            </span>
          </div>
          {emergencies.filter((e) => e.status === "처리중").length > 0 ? (
            emergencies
              .filter((e) => e.status === "처리중")
              .slice(0, 2)
              .map((e) => (
                <div
                  key={e.id}
                  className="flex items-start gap-2.5 p-[9px_11px] rounded-md bg-danger-light border border-red-200 mb-2 last:mb-0"
                >
                  <span className="text-sm shrink-0 mt-px animate-pulse-ring rounded-full">
                    🚨
                  </span>
                  <div>
                    <div className="text-xs font-semibold text-danger">
                      {e.emergencyType}
                    </div>
                    <div className="text-[11px] text-red-500 mt-px">
                      {e.name} · {e.route} · {e.detail || ""}
                    </div>
                  </div>
                </div>
              ))
          ) : (
            <div className="py-6 text-center text-xs text-text-tertiary">
              현재 처리 중인 긴급호출 없음
            </div>
          )}
          <div className="pt-2.5 text-center text-xs text-text-tertiary">
            최근 24시간 긴급호출 {emergencies.length}건
          </div>
        </div>

        {/* Company Stats */}
        <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-[13px] font-semibold text-text-primary">
              소속별 현황
            </span>
          </div>
          {companyStats.map((c, i) => {
            const colors = [
              "var(--color-accent)",
              "var(--color-blue)",
              "#9ca3af",
              "var(--color-warning)",
            ];
            return (
              <div
                key={c.name}
                className="flex items-center gap-2.5 py-[7px] border-b border-border last:border-b-0"
              >
                <span className="text-xs text-text-primary min-w-[80px]">
                  {c.name}
                </span>
                <div className="flex-1 h-[5px] bg-bg rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full animate-bar-grow"
                    style={{
                      width: `${(c.count / maxCompanyCount) * 100}%`,
                      background: colors[i % colors.length],
                    }}
                  />
                </div>
                <span className="text-[11px] text-text-secondary min-w-[36px] text-right font-medium">
                  {c.count}명
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* All Routes Modal */}
      {showAllRoutes && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-[600px] max-h-[80vh] shadow-lg animate-fade-in flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">
                  전체 노선별 탑승 현황
                </h2>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  총 {routeData.length}개 노선 · 탑승인원 많은 순
                </p>
              </div>
              <button
                onClick={() => setShowAllRoutes(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-bg transition-colors cursor-pointer text-text-tertiary hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex items-center gap-4 mb-3 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--color-accent)" }} />
                <span className="text-text-secondary">출근</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--color-blue)" }} />
                <span className="text-text-secondary">퇴근</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wide border-b border-border bg-bg sticky top-0">순위</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wide border-b border-border bg-bg sticky top-0">노선명</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wide border-b border-border bg-bg sticky top-0">출근</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wide border-b border-border bg-bg sticky top-0">퇴근</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wide border-b border-border bg-bg sticky top-0">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {routeData.map((r, i) => (
                    <tr key={r.name} className="hover:bg-bg transition-colors">
                      <td className="px-3 py-2.5 text-xs border-b border-border text-text-tertiary font-medium">{i + 1}</td>
                      <td className="px-3 py-2.5 text-xs border-b border-border font-medium text-text-primary">{r.name}</td>
                      <td className="px-3 py-2.5 text-xs border-b border-border text-right">
                        <span className={`font-semibold ${r.morning > 0 ? "text-accent" : "text-text-tertiary"}`}>
                          {r.morning > 0 ? `${r.morning}명` : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs border-b border-border text-right">
                        <span className={`font-semibold ${r.evening > 0 ? "text-blue" : "text-text-tertiary"}`}>
                          {r.evening > 0 ? `${r.evening}명` : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs border-b border-border text-right font-bold text-text-primary">{r.total}명</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-4 text-[11px] text-text-tertiary">
                <span>총 출근: <strong className="text-accent">{routeData.reduce((s, r) => s + r.morning, 0)}명</strong></span>
                <span>총 퇴근: <strong className="text-blue">{routeData.reduce((s, r) => s + r.evening, 0)}명</strong></span>
                <span>합계: <strong className="text-text-primary">{routeData.reduce((s, r) => s + r.total, 0)}명</strong></span>
              </div>
              <button
                onClick={() => setShowAllRoutes(false)}
                className="px-4 py-1.5 rounded-md text-xs font-medium border border-border-md bg-surface text-text-secondary hover:bg-bg cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

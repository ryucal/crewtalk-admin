"use client";

import { useEffect, useMemo, useState } from "react";
import { Bus, Sunrise, Sunset, Users } from "lucide-react";
import { getRooms, getReportsGroupedByRoomForDate } from "@/lib/firebase/firestore";
import type { Room, ReportMessage } from "@/lib/types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function normalizeCarKey(car: string | undefined): string | null {
  const t = (car ?? "").trim();
  return t.length > 0 ? t : null;
}

function driverDedupeKey(r: ReportMessage): string {
  const name = (r.name || "").trim().toLowerCase();
  const p = digitsOnly(r.phone || "");
  if (name && p.length >= 10) return `np:${name}|${p}`;
  if (p.length >= 10) return `p:${p}`;
  if (r.userId) return `uid:${r.userId}`;
  if (name) return `n:${name}`;
  return `id:${r.id}`;
}

/** 운행 집계에서 제외할 채팅방 이름(노선) */
const EXCLUDED_OPERATION_ROUTE_NAMES = new Set(["정비방", "정비방(예약)"]);

/** 운행 집계에 포함할 일반 채팅방 — 정비방·정비방(예약) 등 제외 */
function isOperationRouteRoom(r: Room): boolean {
  if (r.id >= 998) return false;
  if (EXCLUDED_OPERATION_ROUTE_NAMES.has(r.name.trim())) return false;
  return true;
}

function StatCard({
  label,
  value,
  valueColor,
  sub,
  icon,
  iconBg,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
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
        className="text-[26px] font-semibold leading-none tracking-tight mb-1"
        style={{ color: valueColor }}
      >
        {value}
      </div>
      {sub ? <div className="text-[10px] text-text-tertiary">{sub}</div> : null}
    </div>
  );
}

export default function RouteOperationStatusPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [date, setDate] = useState(todayYmd);
  const [grouped, setGrouped] = useState<{ room: Room; reports: ReportMessage[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const roomsData = await getRooms();
        if (cancelled) return;
        setRooms(roomsData);
        const normal = roomsData.filter(isOperationRouteRoom);
        const g = await getReportsGroupedByRoomForDate(date, normal);
        if (cancelled) return;
        setGrouped(g);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const flatReports = useMemo(
    () => grouped.flatMap((g) => g.reports),
    [grouped]
  );

  const stats = useMemo(() => {
    const 출근 = flatReports.filter((r) => r.reportData?.type === "출근");
    const 퇴근 = flatReports.filter((r) => r.reportData?.type === "퇴근");
    const 운행관련 = flatReports.filter((r) => {
      const t = r.reportData?.type;
      return t === "출근" || t === "퇴근" || t === "야간";
    });

    const totalMorning = 출근.reduce((s, r) => s + (r.reportData?.count ?? 0), 0);
    const totalEvening = 퇴근.reduce((s, r) => s + (r.reportData?.count ?? 0), 0);

    const carSet = new Set<string>();
    for (const r of 운행관련) {
      const k = normalizeCarKey(r.car);
      if (k) carSet.add(k);
    }

    const driverSet = new Set<string>();
    for (const r of 운행관련) {
      driverSet.add(driverDedupeKey(r));
    }

    return {
      totalMorning,
      totalEvening,
      uniqueCars: carSet.size,
      uniqueDrivers: driverSet.size,
      reportCountMorning: 출근.length,
      reportCountEvening: 퇴근.length,
    };
  }, [flatReports]);

  const routeRows = useMemo(() => {
    return grouped
      .map(({ room, reports }) => {
        const 출근 = reports.filter((r) => r.reportData?.type === "출근");
        const 퇴근 = reports.filter((r) => r.reportData?.type === "퇴근");
        const morningPax = 출근.reduce((s, r) => s + (r.reportData?.count ?? 0), 0);
        const eveningPax = 퇴근.reduce((s, r) => s + (r.reportData?.count ?? 0), 0);
        return {
          roomId: room.id,
          name: room.name,
          morningPax,
          eveningPax,
          morningReports: 출근.length,
          eveningReports: 퇴근.length,
          totalPax: morningPax + eveningPax,
        };
      })
      .sort((a, b) => b.totalPax - a.totalPax || a.name.localeCompare(b.name, "ko"));
  }, [grouped]);

  const routeCount = rooms.filter(isOperationRouteRoom).length;

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            노선별 운행 현황
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            인원보고(출근·퇴근·야간) 기준입니다. 운행 대수·기사는 당일 보고에서 차번호·이름·전화(또는
            userId)로 중복을 제거합니다. 정비방·정비방(예약) 채팅방은 제외됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-[11px] text-text-secondary whitespace-nowrap">기준일</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-2.5 py-1.5 border border-border-md rounded-md text-xs bg-surface outline-none focus:border-accent"
          />
        </div>
      </div>

      {error && <p className="text-xs text-danger mb-3">{error}</p>}

      {loading ? (
        <div className="text-sm text-text-tertiary py-12 text-center">불러오는 중…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="총 출근 탑승"
              value={`${stats.totalMorning}명`}
              valueColor="var(--color-accent)"
              sub={`인원보고 ${stats.reportCountMorning}건`}
              icon={<Sunrise size={14} color="#1a7f5a" />}
              iconBg="var(--color-accent-light)"
            />
            <StatCard
              label="총 퇴근 탑승"
              value={`${stats.totalEvening}명`}
              valueColor="var(--color-blue)"
              sub={`인원보고 ${stats.reportCountEvening}건`}
              icon={<Sunset size={14} color="#2563eb" />}
              iconBg="var(--color-blue-light)"
            />
            <StatCard
              label="총 운행 대수"
              value={stats.uniqueCars}
              valueColor="var(--color-text-primary)"
              sub="차량번호(당일 보고 내 중복 제외)"
              icon={<Bus size={14} color="#6b7280" />}
              iconBg="#f3f4f6"
            />
            <StatCard
              label="운행 기사"
              value={stats.uniqueDrivers}
              valueColor="var(--color-text-primary)"
              sub="이름·전화 또는 userId 기준 중복 제외"
              icon={<Users size={14} color="#6b7280" />}
              iconBg="#eef2ff"
            />
          </div>

          <div className="bg-surface border border-border rounded-[10px] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-[13px] font-semibold text-text-primary">
                노선(채팅방)별 인원보고
              </span>
              <span className="text-[11px] text-text-tertiary ml-2">
                {date} · 노선 {routeCount}개
              </span>
            </div>
            {flatReports.length === 0 && routeRows.length > 0 && !loading && (
              <p className="text-[11px] text-text-tertiary px-4 py-2 border-b border-border bg-bg/50">
                이 날짜에 수집된 인원보고가 없습니다.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px] min-w-[520px]">
                <thead>
                  <tr className="border-b border-border bg-bg/80">
                    <th className="px-4 py-2.5 font-semibold text-text-secondary">노선</th>
                    <th className="px-3 py-2.5 font-semibold text-text-secondary text-right">
                      출근 탑승
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-text-tertiary text-right w-[72px]">
                      건
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-text-secondary text-right">
                      퇴근 탑승
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-text-tertiary text-right w-[72px]">
                      건
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-text-secondary text-right">
                      합계
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {routeRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-text-tertiary text-[12px]"
                      >
                        일반 채팅방(노선)이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    routeRows.map((row) => (
                      <tr
                        key={row.roomId}
                        className="border-b border-border/70 last:border-b-0 hover:bg-bg/50"
                      >
                        <td className="px-4 py-2.5 font-medium text-text-primary">{row.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-accent font-medium">
                          {row.morningPax > 0 ? `${row.morningPax}명` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-text-tertiary">
                          {row.morningReports > 0 ? row.morningReports : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-blue font-medium">
                          {row.eveningPax > 0 ? `${row.eveningPax}명` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-text-tertiary">
                          {row.eveningReports > 0 ? row.eveningReports : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-text-primary">
                          {row.totalPax > 0 ? `${row.totalPax}명` : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import type { EnrichedReportMessage } from "@/lib/types";

/** 타 방 인원보고가 이 간격 이하이면 이상(3분 이하, 경계 포함) */
export const DUPLICATE_REPORT_MAX_GAP_MS = 3 * 60 * 1000;

export interface ReportAnomaly {
  identityLabel: string;
  identityKey: string;
  roomAId: string;
  roomAName: string;
  roomBId: string;
  roomBName: string;
  timeA: Date;
  timeB: Date;
  gapMs: number;
  reportType: string;
  car: string;
  name: string;
}

/** 운행일(`date` 필터) 기준 전체 인원보고에 대한 단일 집계 결과 */
export interface DayAnalysisResult {
  reportCount: number;
  anomalies: ReportAnomaly[];
}

export function formatYmdInSeoul(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) {
    const x = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }
  return `${y}-${m}-${day}`;
}

export function formatTimeSeoul(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function normalizeCar(car: string): string {
  return car.replace(/\s+/g, "").toUpperCase();
}

/** 동일인 판별: userId → driverId → 차량번호 → (약한) 이름+차 */
export function getReportIdentityKey(r: EnrichedReportMessage): string {
  const uid = (r.userId || "").trim();
  if (uid) return `u:${uid}`;
  const did = (r.driverId || "").trim();
  if (did) return `d:${did}`;
  const c = normalizeCar(r.car || "");
  if (c) return `c:${c}`;
  return `n:${(r.name || "").trim()}:${c}`;
}

export function getReportIdentityLabel(r: EnrichedReportMessage): string {
  const uid = (r.userId || "").trim();
  if (uid) return `user:${uid}`;
  const did = (r.driverId || "").trim();
  if (did) return did.includes("|") ? did.split("|").pop() || did : did;
  const c = (r.car || "").trim();
  if (c) return c;
  return r.name || "미상";
}

function roomNameById(roomId: string, rooms: Map<string, string>): string {
  return rooms.get(roomId) || `방 ${roomId}`;
}

/**
 * 동일 identity, 서로 다른 방, createdAt 간격 ≤ DUPLICATE_REPORT_MAX_GAP_MS 이면 이상
 * (호출 전 `date` 필터된 당일 reports만 넘길 것)
 */
export function detectCrossRoomDuplicateReports(
  reports: EnrichedReportMessage[],
  roomNames: Map<string, string>,
): ReportAnomaly[] {
  const valid = reports.filter((r) => r.createdAt && r.createdAt.getTime() > 0);
  const sorted = [...valid].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const seen = new Set<string>();
  const anomalies: ReportAnomaly[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const key = getReportIdentityKey(r);
    for (let j = i - 1; j >= 0; j--) {
      const prev = sorted[j];
      if (getReportIdentityKey(prev) !== key) continue;
      const gap = r.createdAt.getTime() - prev.createdAt.getTime();
      if (gap > DUPLICATE_REPORT_MAX_GAP_MS) break;
      if (prev.roomId === r.roomId) continue;

      const dedupe = `${key}|${prev.id}|${r.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const [first, second] = prev.createdAt.getTime() <= r.createdAt.getTime() ? [prev, r] : [r, prev];
      anomalies.push({
        identityKey: key,
        identityLabel: getReportIdentityLabel(r),
        roomAId: first.roomId,
        roomAName: roomNameById(first.roomId, roomNames),
        roomBId: second.roomId,
        roomBName: roomNameById(second.roomId, roomNames),
        timeA: first.createdAt,
        timeB: second.createdAt,
        gapMs: Math.abs(second.createdAt.getTime() - first.createdAt.getTime()),
        reportType: first.reportData?.type || second.reportData?.type || "",
        car: first.car || second.car || "",
        name: first.name || second.name || "",
      });
      break;
    }
  }

  return anomalies;
}

/** 당일 전체 인원보고에 대해 타방·3분 이내 중복만 검사 (`createdAt` 없는 문서는 간격 판단에서만 제외) */
export function analyzeDayReports(
  reports: EnrichedReportMessage[],
  roomNames: Map<string, string>,
): DayAnalysisResult {
  const anomalies = detectCrossRoomDuplicateReports(reports, roomNames);
  return {
    reportCount: reports.length,
    anomalies,
  };
}

export function formatGapLabel(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

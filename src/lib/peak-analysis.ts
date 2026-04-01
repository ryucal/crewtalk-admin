import type { ReportMessage } from "@/lib/types";

/** 30분 단위 버킷 */
export const PEAK_BUCKET_MINUTES = 30;
/** 히트맵 시간 범위 (로컬) */
export const PEAK_START_HOUR = 5;
export const PEAK_END_HOUR = 23;

const BUS_CAPACITY = 45;
const LS_ROUNDTRIP = "crewtalk_peak_roundtrip_v1";

export type PeakReportKind = "출근" | "퇴근";

/** 보고 시각 → 자정부터 분 (파싱 실패 시 null) */
export function parseReportTimeMinutes(timeRaw: string): number | null {
  const t = timeRaw.trim();
  if (!t) return null;

  const m24 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const h = Number(m24[1]);
    const min = Number(m24[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return h * 60 + min;
    return null;
  }

  const ko = t.match(/^(오전|오후)\s*(\d{1,2}):(\d{2})(?::\d{1,2})?$/);
  if (ko) {
    let h = Number(ko[2]);
    const min = Number(ko[3]);
    const ap = ko[1];
    if (ap === "오후" && h < 12) h += 12;
    if (ap === "오전" && h === 12) h = 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return h * 60 + min;
  }

  return null;
}

/** 피크 보고 시각이 속한 30분 구간 — 24시각 HH:MM~HH:MM (끝은 구간 끝, 23:30~24:00 가능) */
export function formatPeakTimeSlotRange24h(timeRaw: string): string {
  const mins = parseReportTimeMinutes(timeRaw);
  if (mins === null) {
    const t = timeRaw.trim();
    return t || "—";
  }
  const start = Math.floor(mins / PEAK_BUCKET_MINUTES) * PEAK_BUCKET_MINUTES;
  const end = Math.min(start + PEAK_BUCKET_MINUTES, 24 * 60);
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${fmt(start)}~${fmt(end)}`;
}

function ymdParts(dateStr: string): [number, number, number] | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** 월~금(1~5) 여부 — 로컬 달력 기준 dateStr YYYY-MM-DD */
export function isWeekdayDateStr(dateStr: string): boolean {
  const p = ymdParts(dateStr);
  if (!p) return false;
  const [y, mo, d] = p;
  const day = new Date(y, mo - 1, d).getDay();
  return day >= 1 && day <= 5;
}

/** 리포트에 등장한 날짜 중 최근 영업일 N일 (내림차순 정렬 후 앞에서 N개) */
export function pickLastNWeekdaysFromReports(reports: ReportMessage[], n: number): string[] {
  const uniq = new Set<string>();
  for (const r of reports) {
    if (r.date && isWeekdayDateStr(r.date)) uniq.add(r.date);
  }
  const sorted = [...uniq].sort((a, b) => b.localeCompare(a));
  return sorted.slice(0, n);
}

export function timeToBucketIndex(minutesFromMidnight: number): number | null {
  const start = PEAK_START_HOUR * 60;
  const end = PEAK_END_HOUR * 60;
  if (minutesFromMidnight < start || minutesFromMidnight >= end) return null;
  return Math.floor((minutesFromMidnight - start) / PEAK_BUCKET_MINUTES);
}

export function bucketIndexToLabel(index: number): string {
  const start = PEAK_START_HOUR * 60 + index * PEAK_BUCKET_MINUTES;
  const h = Math.floor(start / 60);
  const m = start % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function bucketCount(): number {
  return Math.ceil(((PEAK_END_HOUR - PEAK_START_HOUR) * 60) / PEAK_BUCKET_MINUTES);
}

/**
 * 노선 × 시간버킷: 각 셀 = 선택된 N영업일의 **일별 합계** 산술평균 (데이터 없는 날은 0으로 포함)
 */
export function buildPeakHeatmapAverages(
  reports: ReportMessage[],
  weekdayDates: string[],
  routeNames: string[],
  kind: PeakReportKind
): { matrix: number[][]; datesUsed: string[] } {
  const B = bucketCount();
  const datesUsed = weekdayDates.slice(0, 5);
  const nDays = datesUsed.length;
  if (nDays === 0) {
    return { matrix: routeNames.map(() => Array(B).fill(0)), datesUsed: [] };
  }

  const routeIndex = new Map(routeNames.map((name, i) => [name, i]));

  const dailySum: number[][][] = routeNames.map(() =>
    datesUsed.map(() => Array(B).fill(0))
  );

  for (const r of reports) {
    if (!datesUsed.includes(r.date)) continue;
    const rt = r.reportData?.type;
    if (kind === "출근" && rt !== "출근") continue;
    if (kind === "퇴근" && rt !== "퇴근") continue;

    const ri = routeIndex.get(r.route);
    if (ri === undefined) continue;

    const mins = parseReportTimeMinutes(r.time);
    if (mins === null) continue;
    const bi = timeToBucketIndex(mins);
    if (bi === null) continue;

    const di = datesUsed.indexOf(r.date);
    if (di < 0) continue;

    const c = r.reportData?.count ?? 0;
    dailySum[ri][di][bi] += c;
  }

  const matrix = routeNames.map((_, ri) =>
    Array.from({ length: B }, (_, bi) => {
      let sumDay = 0;
      for (let di = 0; di < nDays; di++) sumDay += dailySum[ri][di][bi];
      return sumDay / nDays;
    })
  );

  return { matrix, datesUsed };
}

export function matrixMaxValue(matrix: number[][]): number {
  let m = 0;
  for (const row of matrix) for (const v of row) if (v > m) m = v;
  return m;
}

/** 행별 피크 버킷 평균 인원(최댓값) */
export function rowPeakAverage(matrix: number[][], rowIndex: number): number {
  const row = matrix[rowIndex];
  if (!row.length) return 0;
  return Math.max(...row, 0);
}

/** 단순 참고: 피크 30분 평균 인원 → 45인승 대수 (올림) */
export function busesSimple45(peakSlotAverage: number): number {
  if (peakSlotAverage <= 0) return 0;
  return Math.ceil(peakSlotAverage / BUS_CAPACITY);
}

/**
 * 순환 가정: 왕복 분당 한 대가 (60/RT)회 운행, 매회 최대 45명
 * 시간당 처리능력 ≈ 45 * (60/RT). 피크 30분 평균을 2배해 대략 시간당 수요로 사용.
 */
export function busesWithRoundTrip45(peakSlotAverage: number, roundTripMinutes: number): number {
  if (peakSlotAverage <= 0 || roundTripMinutes <= 0) return busesSimple45(peakSlotAverage);
  const hourlyDemandApprox = peakSlotAverage * 2;
  const perBusHourly = BUS_CAPACITY * (60 / roundTripMinutes);
  if (perBusHourly <= 0) return busesSimple45(peakSlotAverage);
  return Math.ceil(hourlyDemandApprox / perBusHourly);
}

export function loadRoundTripMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_ROUNDTRIP);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(o)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRoundTripMap(map: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_ROUNDTRIP, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

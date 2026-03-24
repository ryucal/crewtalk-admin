import type { Track, TrackPoint } from "@/lib/types";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `<input type="datetime-local">` 값 (로컬, 분 단위) */
export function toDateTimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `datetime-local` 문자열 → epoch ms, 실패 시 null */
export function parseDateTimeLocalMs(value: string): number | null {
  if (!value?.trim()) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** 운행일·시작시각·종료(endedAt) 또는 마지막 GPS 시각으로 기본 구간 */
export function getDefaultGpsRangeFromTrack(track: Track, points?: TrackPoint[]): { startLocal: string; endLocal: string } {
  let startLocal = "";
  let endLocal = "";

  if (track.date) {
    if (track.startTime instanceof Date) {
      startLocal = toDateTimeLocalValue(track.startTime);
    } else if (typeof track.startTime === "string") {
      if (track.startTime.includes("T")) {
        startLocal = toDateTimeLocalValue(new Date(track.startTime));
      } else {
        const m = track.startTime.match(/^(\d{1,2}):(\d{2})/);
        const hm = m ? `${pad2(Number(m[1]))}:${m[2]}` : "00:00";
        startLocal = `${track.date}T${hm}`;
      }
    } else {
      startLocal = `${track.date}T00:00`;
    }
  }

  if (track.endTime instanceof Date) {
    endLocal = toDateTimeLocalValue(track.endTime);
  } else if (typeof track.endTime === "string" && track.endTime.trim()) {
    const parsed = new Date(track.endTime).getTime();
    if (!Number.isNaN(parsed)) endLocal = toDateTimeLocalValue(new Date(parsed));
  } else if (points && points.length > 0) {
    const tsMax = Math.max(...points.map((p) => p.ts ?? 0));
    if (tsMax > 0) endLocal = toDateTimeLocalValue(new Date(tsMax));
  }

  return { startLocal, endLocal };
}

export function filterTrackPointsByTsRange(points: TrackPoint[], startMs: number | null, endMs: number | null): TrackPoint[] {
  if (startMs == null && endMs == null) return points;
  return points.filter((p) => {
    if (p.ts == null || p.ts <= 0) return false;
    if (startMs != null && p.ts < startMs) return false;
    if (endMs != null && p.ts > endMs) return false;
    return true;
  });
}

export type ExportPoint = { lat: number; lng: number; speed: number; heading: number; ts: number };

export function filterExportPointsByTsRange(points: ExportPoint[], startMs: number | null, endMs: number | null): ExportPoint[] {
  if (startMs == null && endMs == null) return points;
  return points.filter((p) => {
    if (!p.ts || p.ts <= 0) return false;
    if (startMs != null && p.ts < startMs) return false;
    if (endMs != null && p.ts > endMs) return false;
    return true;
  });
}

/** ts 오름차순 기준, intervalSec마다 1점 (0 이하면 샘플링 없음). 마지막 점은 유지 */
export function downsamplePointsByInterval(points: ExportPoint[], intervalSec: number): ExportPoint[] {
  if (intervalSec <= 0 || points.length <= 1) return points;
  const sorted = [...points].filter((p) => p.ts > 0).sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0) return points;

  const out: ExportPoint[] = [];
  let lastKeptTs = -Infinity;
  const intervalMs = intervalSec * 1000;

  for (const p of sorted) {
    if (out.length === 0 || p.ts - lastKeptTs >= intervalMs) {
      out.push(p);
      lastKeptTs = p.ts;
    }
  }

  const last = sorted[sorted.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
}

const COMPASS_8 = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"] as const;

/** heading 도(북 0°, 시계방향) → 8방위 한글 */
export function headingDegreesToKorean8(headingDeg: number): string {
  if (!Number.isFinite(headingDeg)) return "—";
  const d = ((headingDeg % 360) + 360) % 360;
  const idx = Math.floor((d + 22.5) / 45) % 8;
  return COMPASS_8[idx];
}

/** Firestore speed를 km/h 정수 문자열로 (단위는 앱 저장값이 km/h라고 가정) */
export function formatSpeedKmh(speed: number): string {
  if (!Number.isFinite(speed)) return "—";
  return `${Math.round(speed)} km/h`;
}

export function formatTimeWithSeconds(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

import * as XLSX from "xlsx";
import type { Track } from "@/lib/types";
import { getTrackPointsForExport } from "@/lib/firebase/firestore";
import {
  downsamplePointsByInterval,
  filterExportPointsByTsRange,
  formatSpeedKmh,
  formatTimeWithSeconds,
  headingDegreesToKorean8,
} from "@/lib/track-gps-utils";

const COLUMNS = ["일자", "시간", "차량번호", "기사명", "노선", "세부노선", "보고인원", "위도", "경도", "방향", "스피드", "주소"] as const;

export type TrackExcelExportOptions = {
  /** 포함 시작 시각 (epoch ms). 없으면 하한 없음 */
  startTsMs?: number | null;
  /** 포함 종료 시각 (epoch ms). 없으면 상한 없음 */
  endTsMs?: number | null;
  /** 0 또는 미지정: 모든 포인트, 양수: 해당 초 간격으로 다운샘플 */
  sampleIntervalSec?: number;
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTrackDateTime(track: Track): { date: string; time: string } {
  const fallback = new Date().getTime();
  if (track.date) {
    const timeFromStart =
      track.startTime instanceof Date
        ? track.startTime.getTime()
        : typeof track.startTime === "string"
          ? track.startTime.includes("T")
            ? new Date(track.startTime).getTime()
            : fallback
          : fallback;
    const d = new Date(timeFromStart);
    const date = track.date;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { date, time };
  }
  const d = new Date(fallback);
  return {
    date: formatDate(d.getTime()),
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

export async function exportTracksToExcel(
  tracks: Track[],
  selectedDate: string,
  options?: TrackExcelExportOptions
): Promise<void> {
  const rows: (string | number)[][] = [COLUMNS.slice()];

  const startMs = options?.startTsMs ?? null;
  const endMs = options?.endTsMs ?? null;
  const intervalSec = options?.sampleIntervalSec ?? 0;

  for (const track of tracks) {
    let pts = await getTrackPointsForExport(track.id);
    pts = filterExportPointsByTsRange(pts, startMs, endMs);
    if (intervalSec > 0) pts = downsamplePointsByInterval(pts, intervalSec);

    const { date: trackDate, time: trackTime } = getTrackDateTime(track);
    const carNumber = track.carNumber ?? "-";
    const driverName = track.driverName ?? "-";
    const routeName = track.routeName ?? "-";
    const subRoute = track.subRoute ?? "-";
    const reportCount = `${track.reportCount ?? 0}명`;

    if (pts.length === 0) {
      rows.push([trackDate, trackTime, carNumber, driverName, routeName, subRoute, reportCount, "", "", "", "", "-"]);
      continue;
    }

    for (const p of pts) {
      const date = p.ts ? formatDate(p.ts) : trackDate;
      const time = p.ts ? formatTimeWithSeconds(p.ts) : trackTime;
      const directionLabel = headingDegreesToKorean8(p.heading);
      const speedLabel = formatSpeedKmh(p.speed);
      rows.push([
        date,
        time,
        carNumber,
        driverName,
        routeName,
        subRoute,
        reportCount,
        p.lat,
        p.lng,
        directionLabel,
        speedLabel,
        "-",
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "운행경로");

  const fileName = `운행경로_${selectedDate}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

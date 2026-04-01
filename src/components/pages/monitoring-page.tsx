"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Calendar, MapPin, Route, Download, RotateCcw } from "lucide-react";
import { getTracks, getTrackPoints } from "@/lib/firebase/firestore";
import { exportTracksToExcel } from "@/lib/excel-export";
import type { Track, TrackPoint } from "@/lib/types";
import NaverMap from "@/components/NaverMap";
import {
  filterTrackPointsByTsRange,
  getDefaultGpsRangeFromTrack,
  parseDateTimeLocalMs,
  toDateTimeLocalValue,
} from "@/lib/track-gps-utils";

function formatDateTime(track: Track): string {
  const date = track.date || "";
  let time = "";
  if (track.startTime) {
    if (typeof track.startTime === "string") {
      const t = track.startTime;
      if (t.includes("T")) {
        const d = new Date(t);
        time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      } else {
        time = t;
      }
    } else if (track.startTime instanceof Date) {
      time = `${String(track.startTime.getHours()).padStart(2, "0")}:${String(track.startTime.getMinutes()).padStart(2, "0")}`;
    }
  }
  return [date, time].filter(Boolean).join(" ");
}

function formatTrackLabel(track: Track): string {
  const 일자시간 = formatDateTime(track);
  const 차량번호 = track.carNumber || "-";
  const 이름 = track.driverName || "-";
  const 노선 = track.routeName || "-";
  const 세부노선 = track.subRoute || "";
  const 인원 = `${track.reportCount ?? 0}명`;
  if (세부노선) {
    return `(${일자시간}, ${차량번호}, ${이름}, ${노선}, ${세부노선}, ${인원})`;
  }
  return `(${일자시간}, ${차량번호}, ${이름}, ${노선}, ${인원})`;
}

function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SAMPLE_INTERVAL_OPTIONS: { label: string; sec: number }[] = [
  { label: "전체", sec: 0 },
  { label: "10초", sec: 10 },
  { label: "30초", sec: 30 },
  { label: "1분", sec: 60 },
  { label: "3분", sec: 180 },
  { label: "5분", sec: 300 },
];

export default function MonitoringPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateString());
  /** 운행 경로 목록: 기본 인원보고 0명만, 전체 시 모든 트랙 */
  const [trackListScope, setTrackListScope] = useState<"zeroOnly" | "all">("zeroOnly");
  /** GPS 구간 (datetime-local, 빈 값이면 해당 쪽 제한 없음) */
  const [gpsRangeStart, setGpsRangeStart] = useState("");
  const [gpsRangeEnd, setGpsRangeEnd] = useState("");
  /** 엑셀 다운샘플 간격(초). 0 = 전체 행 */
  const [sampleIntervalSec, setSampleIntervalSec] = useState(0);
  const gpsRangeInitForTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTracks() {
      setLoading(true);
      try {
        const data = await getTracks({
          reportCountZeroOnly: trackListScope === "zeroOnly",
          date: selectedDate || undefined,
        });
        if (cancelled) return;
        setTracks(data);
        setSelectedTrackId(null);
        if (data.length > 0) {
          setSelectedTrackId(data[0].id);
        }
      } catch (error) {
        if (!cancelled) console.error("Error loading tracks:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadTracks();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, trackListScope]);

  useEffect(() => {
    if (!selectedTrackId) {
      setPoints([]);
      return;
    }
    setPoints([]);
    setPointsLoading(true);
    getTrackPoints(selectedTrackId)
      .then((pts) => setPoints(pts))
      .catch((err) => {
        console.error("Error loading track points:", err);
        setPoints([]);
      })
      .finally(() => setPointsLoading(false));
  }, [selectedTrackId]);

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const [exporting, setExporting] = useState(false);

  // 선택 트랙이 바뀔 때만: 운행일·시작시각·종료(endedAt)로 구간 초기화 (목록 재조회로는 유지)
  useEffect(() => {
    if (!selectedTrackId) {
      setGpsRangeStart("");
      setGpsRangeEnd("");
      gpsRangeInitForTrackIdRef.current = null;
      return;
    }
    if (gpsRangeInitForTrackIdRef.current === selectedTrackId) return;
    const t = tracks.find((x) => x.id === selectedTrackId);
    if (!t) return;
    // 트랙 메타가 늦게 들어와도 한 번만 초기화되도록, 메타가 준비된 시점에만 ref 설정
    gpsRangeInitForTrackIdRef.current = selectedTrackId;
    const { startLocal, endLocal } = getDefaultGpsRangeFromTrack(t);
    setGpsRangeStart(startLocal);
    setGpsRangeEnd(endLocal);
  }, [selectedTrackId, tracks]);

  // 종료 시각 메타가 없을 때: 로드된 포인트의 마지막 ts로 종료 상한 제안
  useEffect(() => {
    if (!selectedTrack || pointsLoading || points.length === 0) return;
    if (selectedTrack.endTime) return;
    setGpsRangeEnd((prev) => {
      if (prev.trim()) return prev;
      const maxTs = Math.max(...points.map((p) => p.ts ?? 0));
      return maxTs > 0 ? toDateTimeLocalValue(new Date(maxTs)) : prev;
    });
  }, [selectedTrackId, selectedTrack, pointsLoading, points]);

  const rangeStartMs = useMemo(() => parseDateTimeLocalMs(gpsRangeStart), [gpsRangeStart]);
  const rangeEndMs = useMemo(() => parseDateTimeLocalMs(gpsRangeEnd), [gpsRangeEnd]);

  const filteredPoints = useMemo(
    () => filterTrackPointsByTsRange(points, rangeStartMs, rangeEndMs),
    [points, rangeStartMs, rangeEndMs],
  );

  function resetGpsRangeFromTrack() {
    if (!selectedTrack) return;
    const { startLocal, endLocal } = getDefaultGpsRangeFromTrack(
      selectedTrack,
      points.length > 0 ? points : undefined,
    );
    setGpsRangeStart(startLocal);
    setGpsRangeEnd(endLocal);
  }

  async function handleExport() {
    if (tracks.length === 0) return;
    setExporting(true);
    try {
      await exportTracksToExcel(tracks, selectedDate, {
        startTsMs: rangeStartMs,
        endTsMs: rangeEndMs,
        sampleIntervalSec,
      });
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            관제 시스템
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            선택한 날짜의 운행 트랙을 표시합니다. 기본은 인원보고{" "}
            <span className="font-medium text-text-secondary">0명</span>인 항목만이며, 「전체」로 모든 트랙을 볼 수 있습니다. GPS는 각 트랙의{" "}
            <code className="px-0.5 bg-bg rounded text-text-secondary">points</code> 서브컬렉션에서 불러옵니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[440px_1fr] gap-3.5 h-[calc(100vh-260px)] min-h-[400px]">
        {/* 운행 경로 선택 - 왼쪽 목록 */}
        <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm flex flex-col min-h-0">
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Route size={14} className="text-accent shrink-0" />
                <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                  운행 경로 선택
                </span>
                <span className="text-xs text-text-secondary">
                  (총 {tracks.length}건)
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Calendar size={12} className="text-text-tertiary" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-2 py-1 text-[11px] border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
                />
              </div>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="목록 범위">
              <span className="text-[10px] text-text-tertiary mr-0.5 shrink-0">인원보고</span>
              <button
                type="button"
                onClick={() => setTrackListScope("zeroOnly")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                  trackListScope === "zeroOnly"
                    ? "bg-accent-light border-accent text-accent"
                    : "bg-bg border-border text-text-secondary hover:bg-surface hover:text-text-primary"
                }`}
              >
                0명만
              </button>
              <button
                type="button"
                onClick={() => setTrackListScope("all")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                  trackListScope === "all"
                    ? "bg-accent-light border-accent text-accent"
                    : "bg-bg border-border text-text-secondary hover:bg-surface hover:text-text-primary"
                }`}
              >
                전체
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
            {loading ? (
              <div className="py-4 text-center text-xs text-text-tertiary">로딩 중...</div>
            ) : tracks.length === 0 ? (
              <div className="py-4 text-center text-xs text-text-tertiary">
                {trackListScope === "zeroOnly"
                  ? "해당 날짜에 인원보고 0명인 운행 트랙이 없습니다. 「전체」로 전환해 보세요."
                  : "해당 날짜의 운행 트랙이 없습니다."}
              </div>
            ) : (
              tracks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTrackId(t.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md cursor-pointer transition-all text-[12px] leading-snug whitespace-nowrap overflow-hidden text-ellipsis ${
                    selectedTrackId === t.id
                      ? "bg-accent-light text-accent font-medium"
                      : "hover:bg-bg text-text-primary"
                  }`}
                >
                  {formatTrackLabel(t)}
                </button>
              ))
            )}
          </div>
          {selectedTrack && points.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border text-[11px] text-text-tertiary">
              {filteredPoints.length}개 표시
              {filteredPoints.length !== points.length ? ` (전체 ${points.length}개)` : ""}
            </div>
          )}
        </div>

        {/* 이동 경로 지도 - 오른쪽 */}
        <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin size={14} className="text-accent shrink-0" />
              <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                이동 경로
              </span>
              {pointsLoading && (
                <span className="text-[11px] text-text-tertiary">로딩 중...</span>
              )}
            </div>
            <div className="flex items-end gap-2 shrink-0">
              <label className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                엑셀 샘플 간격
                <select
                  value={sampleIntervalSec}
                  onChange={(e) => setSampleIntervalSec(Number(e.target.value))}
                  className="h-[30px] px-2 text-[11px] border border-border rounded-md bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent min-w-[88px]"
                >
                  {SAMPLE_INTERVAL_OPTIONS.map((o) => (
                    <option key={o.sec} value={o.sec}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || tracks.length === 0}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-border bg-bg text-text-primary hover:bg-accent-light hover:border-accent hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={12} />
                {exporting ? "다운로드 중..." : "엑셀 다운로드"}
              </button>
            </div>
          </div>

          {selectedTrack && (
            <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-bg px-3 py-2.5">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                  구간 시작
                  <input
                    type="datetime-local"
                    value={gpsRangeStart}
                    onChange={(e) => setGpsRangeStart(e.target.value)}
                    className="px-2 py-1 text-[11px] border border-border rounded-md bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                  구간 종료
                  <input
                    type="datetime-local"
                    value={gpsRangeEnd}
                    onChange={(e) => setGpsRangeEnd(e.target.value)}
                    className="px-2 py-1 text-[11px] border border-border rounded-md bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={resetGpsRangeFromTrack}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md border border-border text-text-secondary hover:bg-accent-light hover:text-accent hover:border-accent transition-colors"
                >
                  <RotateCcw size={11} />
                  운행 구간으로 초기화
                </button>
              </div>
              <p className="text-[10px] text-text-tertiary leading-snug">
                시작·종료를 비우면 해당 방향 제한 없이 전체가 표시·다운로드됩니다. 종료 시각은 Firestore{" "}
                <code className="px-0.5 bg-surface rounded">endedAt</code> 등이 있으면 자동 반영되고, 없으면 마지막 GPS 시각을
                제안합니다.
              </p>
            </div>
          )}

          <NaverMap points={filteredPoints} className="w-full flex-1 min-h-0" />

          {!loading && tracks.length === 0 && (
            <div className="mt-4 p-4 rounded-lg border border-dashed border-border bg-bg text-center text-sm text-text-tertiary">
              Firestore <code className="px-1.5 py-0.5 bg-surface rounded text-text-secondary">tracks</code>에 해당 날짜 데이터가 없거나, 날짜·인원보고 필터와 맞는 트랙이 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

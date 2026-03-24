"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Calendar, Play } from "lucide-react";
import { getAllEnrichedReportsByDate } from "@/lib/firebase/firestore";
import type { Room } from "@/lib/types";
import {
  analyzeDayReports,
  formatGapLabel,
  formatTimeSeoul,
  formatYmdInSeoul,
  type DayAnalysisResult,
} from "@/lib/chat-report-anomalies";

interface ChatReportAnomalyPanelProps {
  rooms: Room[];
}

export default function ChatReportAnomalyPanel({ rooms }: ChatReportAnomalyPanelProps) {
  const [analysisDate, setAnalysisDate] = useState(() => formatYmdInSeoul());
  const [result, setResult] = useState<DayAnalysisResult | null>(null);
  const [resultDate, setResultDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms) {
      if (r.id < 998) m.set(String(r.id), r.name);
    }
    return m;
  }, [rooms]);

  const runAnalysis = useCallback(async () => {
    if (rooms.filter((r) => r.id < 998).length === 0) {
      setResult({ reportCount: 0, anomalies: [] });
      setResultDate(analysisDate);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const reports = await getAllEnrichedReportsByDate(analysisDate, rooms);
      setResult(analyzeDayReports(reports, roomNameMap));
      setResultDate(analysisDate);
    } catch (e) {
      console.error(e);
      setError("인원보고를 불러오지 못했습니다.");
      setResult(null);
      setResultDate(null);
    } finally {
      setLoading(false);
    }
  }, [analysisDate, rooms, roomNameMap]);

  const onDateChange = (next: string) => {
    setAnalysisDate(next);
    setResult(null);
    setResultDate(null);
    setError(null);
  };

  const showStaleHint = result != null && resultDate != null && resultDate !== analysisDate;

  return (
    <div className="flex flex-col min-h-0 h-full gap-3">
      <h2 className="text-xs font-semibold text-text-primary flex items-center gap-1.5 shrink-0">
        <AlertTriangle size={14} className="text-amber-600 shrink-0" />
        인원보고 이상 집계
      </h2>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <label className="flex items-center gap-1.5 text-[10px] text-text-tertiary">
          <Calendar size={12} />
          운행일
          <input
            type="date"
            value={analysisDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="px-2 py-1 text-[11px] border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <button
          type="button"
          onClick={() => void runAnalysis()}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-md border border-accent bg-accent text-white hover:bg-accent-dark disabled:opacity-50"
        >
          <Play size={11} className={loading ? "opacity-50" : ""} />
          {loading ? "집계 중…" : "집계 실행"}
        </button>
      </div>

      {showStaleHint && (
        <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 shrink-0">
          운행일이 바뀌었습니다. 선택한 날짜로 보려면 「집계 실행」을 다시 눌러 주세요.
        </p>
      )}

      {error && <p className="text-[11px] text-danger shrink-0">{error}</p>}

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-0.5">
        {result == null && !loading && (
          <p className="text-[11px] text-text-tertiary py-6 text-center leading-relaxed px-1">
            운행일을 선택한 뒤 「집계 실행」을 누르면
            <br />
            해당 일자 인원보고를 불러와 이상 여부를 분석합니다.
          </p>
        )}

        {loading && (
          <p className="text-[11px] text-text-tertiary py-6 text-center">Firestore에서 불러오는 중…</p>
        )}

        {result != null && !loading && resultDate === analysisDate && (
          <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
            <div className="text-[10px] text-text-tertiary mb-2">
              <span className="font-medium text-text-primary">{resultDate}</span> · 인원보고{" "}
              <span className="text-text-primary font-medium">{result.reportCount}건</span>
              {result.anomalies.length === 0 ? (
                <span className="text-emerald-600 font-medium ml-1">· 이상 없음</span>
              ) : (
                <span className="text-amber-700 font-medium ml-1">· 중복 보고 {result.anomalies.length}건</span>
              )}
            </div>
            {result.anomalies.length > 0 && (
              <ul className="space-y-2 border-t border-border pt-2 mt-1">
                {result.anomalies.map((a, idx) => (
                  <li
                    key={`${a.identityKey}-${a.roomAId}-${a.roomBId}-${idx}`}
                    className="text-[10px] text-text-primary leading-relaxed rounded-md bg-surface px-2 py-1.5 border border-border/80"
                  >
                    <div className="font-medium text-amber-800">
                      {a.name || a.identityLabel}
                      {a.car ? ` · ${a.car}` : ""}
                      {a.reportType ? ` · ${a.reportType}` : ""}
                    </div>
                    <div className="text-text-secondary mt-0.5">
                      {a.roomAName} → {a.roomBName}
                    </div>
                    <div className="text-text-tertiary mt-0.5">
                      {formatTimeSeoul(a.timeA)} → {formatTimeSeoul(a.timeB)} (간격 {formatGapLabel(a.gapMs)})
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {result != null && resultDate === analysisDate && !loading && (
        <p className="text-[10px] text-text-tertiary shrink-0 border-t border-border pt-2 leading-snug">
          서로 다른 방에서 동일 기사/차량으로 3분 이내 인원보고가 있으면 이상으로 표시됩니다.{" "}
          <code className="px-0.5 bg-bg rounded">createdAt</code>이 없는 메시지는 간격 비교에서 제외됩니다.
        </p>
      )}
    </div>
  );
}

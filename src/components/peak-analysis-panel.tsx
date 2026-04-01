"use client";

import { useMemo, useState, useEffect } from "react";
import type { ReportMessage } from "@/lib/types";
import {
  buildPeakHeatmapAverages,
  bucketCount,
  bucketIndexToLabel,
  matrixMaxValue,
  pickLastNWeekdaysFromReports,
  rowPeakAverage,
  busesSimple45,
  busesWithRoundTrip45,
  loadRoundTripMap,
  saveRoundTripMap,
  type PeakReportKind,
} from "@/lib/peak-analysis";

function heatColor(intensity: number): string {
  if (intensity <= 0) return "transparent";
  const a = 0.12 + intensity * 0.78;
  return `rgba(217, 119, 6, ${a.toFixed(3)})`;
}

export default function PeakAnalysisPanel({
  reports,
  routeNames,
}: {
  reports: ReportMessage[];
  routeNames: string[];
}) {
  const [kind, setKind] = useState<PeakReportKind>("출근");
  const [roundTrip, setRoundTrip] = useState<Record<string, number>>({});

  useEffect(() => {
    setRoundTrip(loadRoundTripMap());
  }, []);

  const weekdayDates = useMemo(() => pickLastNWeekdaysFromReports(reports, 5), [reports]);

  const { matrix, datesUsed } = useMemo(
    () => buildPeakHeatmapAverages(reports, weekdayDates, routeNames, kind),
    [reports, weekdayDates, routeNames, kind]
  );

  const maxV = useMemo(() => matrixMaxValue(matrix), [matrix]);
  const B = bucketCount();

  const persistRt = (route: string, minutes: number) => {
    setRoundTrip((prev) => {
      const next = { ...prev };
      if (!minutes || minutes <= 0) delete next[route];
      else next[route] = minutes;
      saveRoundTripMap(next);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5 min-h-0">
      {/* ① 피크 시간 분석 — 히트맵만 */}
      <section className="bg-surface border border-border rounded-[10px] shadow-sm overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[13px] font-semibold text-text-primary tracking-tight">피크 시간 분석</h2>
          <p className="text-[11px] text-text-tertiary mt-1.5 leading-relaxed">
            최근 <strong className="text-text-secondary">영업일 최대 5일</strong> 기준, 노선별·30분 단위{" "}
            <strong className="text-text-secondary">일별 합계의 산술평균</strong>입니다. 출근/퇴근 보고만 사용합니다.
            {datesUsed.length > 0 ? (
              <span className="block mt-1 text-[10px]">반영 날짜: {datesUsed.join(", ")}</span>
            ) : (
              <span className="block mt-1 text-[10px] text-warning">
                영업일 데이터가 없습니다. 인원보고가 쌓이면 표시됩니다.
              </span>
            )}
          </p>
        </div>

        <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-medium text-text-tertiary">구분</span>
          <div className="inline-flex rounded-lg border border-border-md p-0.5 bg-bg">
            <button
              type="button"
              onClick={() => setKind("출근")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                kind === "출근"
                  ? "bg-surface text-accent border border-accent shadow-sm"
                  : "text-text-secondary border border-transparent hover:text-text-primary"
              }`}
            >
              오전 · 출근
            </button>
            <button
              type="button"
              onClick={() => setKind("퇴근")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                kind === "퇴근"
                  ? "bg-surface text-blue border border-blue shadow-sm"
                  : "text-text-secondary border border-transparent hover:text-text-primary"
              }`}
            >
              오후 · 퇴근
            </button>
          </div>
        </div>

        <div className="w-full overflow-x-auto overflow-y-visible p-4 sm:p-5">
          <table className="border-collapse text-[10px] w-max">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-bg px-2.5 py-2 text-left font-semibold text-text-tertiary border-b border-r border-border min-w-[104px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                  노선
                </th>
                {Array.from({ length: B }, (_, bi) => (
                  <th
                    key={bi}
                    className="px-1 py-2 text-center font-medium text-text-tertiary border-b border-border whitespace-nowrap min-w-[36px]"
                  >
                    {bucketIndexToLabel(bi)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routeNames.map((name, ri) => (
                <tr key={name}>
                  <td
                    className="sticky left-0 z-10 bg-surface px-2.5 py-1.5 font-medium text-text-primary border-b border-r border-border text-[11px] max-w-[140px] truncate shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]"
                    title={name}
                  >
                    {name}
                  </td>
                  {matrix[ri]?.map((v, bi) => {
                    const inten = maxV > 0 ? Math.min(1, v / maxV) : 0;
                    return (
                      <td
                        key={bi}
                        className="border-b border-border text-center align-middle p-0 min-w-[36px]"
                        style={{ background: heatColor(inten) }}
                        title={`${bucketIndexToLabel(bi)} · 평균 약 ${v < 1 ? v.toFixed(1) : Math.round(v)}명`}
                      >
                        <span
                          className={`inline-block py-1.5 px-1 ${v > 0 ? "text-text-primary font-semibold" : "text-text-tertiary"}`}
                        >
                          {v >= 1 ? Math.round(v) : v > 0 ? v.toFixed(1) : ""}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ② 순환·셔틀 왕복 시간 + 참고 대수 */}
      <section className="bg-surface border border-border rounded-[10px] shadow-sm overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[13px] font-semibold text-text-primary tracking-tight">순환·셔틀 왕복 시간</h2>
          <p className="text-[11px] text-text-tertiary mt-1.5 leading-relaxed">
            노선별 왕복 소요(분)을 입력하면 아래 「왕복 반영」 대수에 반영됩니다. 비우면 단순(피크 인원÷45)만 사용합니다. 값은{" "}
            <strong className="text-text-secondary">이 브라우저에만</strong> 저장됩니다. 45인승·왕복 기반 수치는{" "}
            <strong className="text-text-secondary">참고 추정</strong>이며 실제 배차와 다를 수 있습니다.
          </p>
        </div>

        <div className="px-5 py-4 border-b border-border bg-bg/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-3">
            {routeNames.map((name) => (
              <label
                key={name}
                className="flex items-center gap-2 text-[12px] rounded-md border border-border-md bg-surface px-3 py-2"
              >
                <span className="truncate flex-1 min-w-0 text-text-primary font-medium" title={name}>
                  {name}
                </span>
                <span className="text-[10px] text-text-tertiary shrink-0 whitespace-nowrap">분</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  placeholder="—"
                  value={roundTrip[name] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") persistRt(name, 0);
                    else {
                      const n = parseInt(v, 10);
                      if (Number.isFinite(n) && n > 0) persistRt(name, n);
                    }
                  }}
                  className="w-[4.5rem] shrink-0 px-2 py-1.5 border border-border-md rounded-md text-right text-xs bg-bg outline-none focus:border-accent"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 overflow-x-auto">
          <h3 className="text-[11px] font-semibold text-text-primary mb-3">
            노선별 피크(30분 평균 최댓값) → 45인승 참고 대수
          </h3>
          <p className="text-[10px] text-text-tertiary mb-3">
            위에서 선택한 <strong className="text-text-secondary">{kind === "출근" ? "출근" : "퇴근"}</strong> 히트맵과
            왕복 시간 입력을 함께 사용합니다.
          </p>
          <table className="w-full text-[12px] border-collapse min-w-[520px]">
            <thead>
              <tr className="text-text-tertiary border-b border-border text-[11px]">
                <th className="text-left py-2 pr-3 font-semibold">노선</th>
                <th className="text-right py-2 px-3 font-semibold">피크 평균(명)</th>
                <th className="text-right py-2 px-3 font-semibold">단순 대수</th>
                <th className="text-right py-2 pl-3 font-semibold">왕복 반영</th>
              </tr>
            </thead>
            <tbody>
              {routeNames.map((name, ri) => {
                const peak = rowPeakAverage(matrix, ri);
                const rt = roundTrip[name];
                const simple = busesSimple45(peak);
                const adj = rt && rt > 0 ? busesWithRoundTrip45(peak, rt) : simple;
                return (
                  <tr key={name} className="border-b border-border last:border-b-0 hover:bg-bg/60">
                    <td className="py-2 pr-3 font-medium text-text-primary truncate max-w-[180px]" title={name}>
                      {name}
                    </td>
                    <td className="text-right py-2 px-3 text-text-secondary tabular-nums">
                      {peak < 1 ? peak.toFixed(1) : Math.round(peak)}
                    </td>
                    <td className="text-right py-2 px-3 tabular-nums">{simple > 0 ? `${simple}대` : "—"}</td>
                    <td className="text-right py-2 pl-3 font-semibold text-warning tabular-nums">
                      {adj > 0 ? `${adj}대` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

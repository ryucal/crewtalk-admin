"use client";

import { useEffect, useState } from "react";
import { getRooms, getAllReportsByDate } from "@/lib/firebase/firestore";
import PeakAnalysisPanel from "@/components/peak-analysis-panel";
import type { Room, ReportMessage } from "@/lib/types";

export default function PeakAnalysisPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reports, setReports] = useState<ReportMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const roomsData = await getRooms();
        setRooms(roomsData);
        const normalRooms = roomsData.filter((r) => r.id < 998);
        const datePromises = Array.from({ length: 14 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return getAllReportsByDate(dateStr, normalRooms);
        });
        const flat = (await Promise.all(datePromises)).flat();
        setReports(flat);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const routeNames = rooms
    .filter((r) => r.id < 998)
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <div className="animate-fade-in flex flex-col gap-6 pb-2">
      <div>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">피크 시간 분석</h1>
        <p className="text-xs text-text-tertiary mt-1 max-w-3xl">
          노선별 탑승 보고 패턴을 최근 영업일 기준으로 집계합니다. 대시보드 피크 카드와 동일한 14일치 인원보고를 불러옵니다.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-text-tertiary py-16 text-center border border-border rounded-[10px] bg-surface">
          불러오는 중…
        </div>
      ) : (
        <PeakAnalysisPanel reports={reports} routeNames={routeNames} />
      )}
    </div>
  );
}

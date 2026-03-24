"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getRooms, getAllEmergencies, updateEmergencyStatus, updateEmergencyComment } from "@/lib/firebase/firestore";
import { formatDate } from "@/lib/mock-data";
import type { Room, EmergencyMessage } from "@/lib/types";

const typeStyles: Record<string, string> = {
  "차량 고장": "bg-danger-light text-danger",
  "승객 난동": "bg-warning-light text-warning",
  "응급 환자": "bg-blue-light text-blue",
  "사고 발생": "bg-danger-light text-danger",
};

const ITEMS_PER_PAGE = 20;

export default function EmergencyPage() {
  const [emergencies, setEmergencies] = useState<EmergencyMessage[]>([]);
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const loadData = async () => {
    try {
      const rooms = await getRooms();
      const normalRooms = rooms.filter((r) => r.id < 998);
      const emergenciesData = await getAllEmergencies(normalRooms, 100);
      setEmergencies(emergenciesData);
    } catch (error) {
      console.error("Error loading emergencies:", error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalPages = Math.ceil(emergencies.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedEmergencies = emergencies.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const handleStatusChange = async (e: EmergencyMessage, newStatus: "처리중" | "완료") => {
    const roomId = e.roomId != null ? String(e.roomId) : "";
    const messageId = e.id != null ? String(e.id) : "";
    if (!roomId || !messageId) {
      alert("채팅방 정보를 찾을 수 없어 상태를 변경할 수 없습니다.");
      return;
    }
    try {
      await updateEmergencyStatus(roomId, messageId, newStatus);
      setEmergencies((prev) =>
        prev.map((item) => (item.id === e.id ? { ...item, status: newStatus } : item))
      );
    } catch (error) {
      console.error("Error updating status:", error);
      alert("상태 변경에 실패했습니다.");
    }
  };

  const handleCommentBlur = async (e: EmergencyMessage, value: string) => {
    const roomId = e.roomId != null ? String(e.roomId) : "";
    const messageId = e.id != null ? String(e.id) : "";
    if (!roomId || !messageId) return;
    try {
      await updateEmergencyComment(roomId, messageId, value);
    } catch (error) {
      console.error("Error updating comment:", error);
      alert("코멘트 저장에 실패했습니다.");
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            긴급호출 이력
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            고장·사고·응급 이력 조회 · 내용: 입력 후 입력창 밖을 클릭하면 자동 저장됩니다
          </p>
        </div>
      </div>

      {/* 미처리 긴급 호출 Banner */}
      {emergencies.some((e) => e.status === "처리중") && (
        <div className="bg-danger-light border border-red-200 rounded-[10px] p-4 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl animate-pulse-ring rounded-full">🚨</span>
            <div className="text-sm font-semibold text-danger">
              미처리 긴급 호출 내역
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {emergencies
              .filter((e) => e.status === "처리중")
              .map((e) => (
                <span
                  key={e.id}
                  className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white/60 text-red-700 border border-red-200"
                >
                  {e.name} · {e.emergencyType}
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["시간", "기사명", "노선", "차량번호", "유형", "연락처", "내용", "처리상태"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wide border-b border-border bg-bg"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {emergencies.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-xs text-text-tertiary">
                  긴급호출 이력이 없습니다.
                </td>
              </tr>
            ) : (
              paginatedEmergencies.map((e) => (
              <tr key={e.id} className="hover:bg-bg transition-colors">
                <td className="px-3 py-2.5 text-xs border-b border-border whitespace-nowrap">
                  {formatDate(e.date)} {e.time}
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border font-medium">
                  {e.name}
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  {e.route}
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border font-mono">
                  {e.car}
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  <span
                    className={`text-[10px] font-medium px-[7px] py-[2px] rounded ${typeStyles[e.emergencyType] || ""}`}
                  >
                    {e.emergencyType}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border text-text-secondary">
                  {e.phone || "—"}
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  <div className="space-y-1 min-w-[160px] max-w-[280px]">
                    {e.detail && (
                      <div className="text-text-tertiary text-[10px] truncate" title={e.detail}>
                        {e.detail}
                      </div>
                    )}
                    {expandedCommentId === e.id ? (
                      <div className="relative">
                        <textarea
                          value={e.adminComment ?? ""}
                          onChange={(ev) =>
                            setEmergencies((prev) =>
                              prev.map((item) =>
                                item.id === e.id
                                  ? { ...item, adminComment: ev.target.value }
                                  : item
                              )
                            )
                          }
                          onBlur={(ev) => {
                            handleCommentBlur(e, ev.target.value);
                            setExpandedCommentId(null);
                          }}
                          placeholder="관리자 코멘트 입력..."
                          autoFocus
                          rows={4}
                          className="w-full px-2 py-1.5 text-xs border border-border-md rounded-md bg-surface outline-none focus:border-accent resize-none"
                        />
                        <button
                          type="button"
                          onClick={() => setExpandedCommentId(null)}
                          className="absolute top-1 right-1 text-[10px] text-text-tertiary hover:text-text-primary"
                        >
                          접기
                        </button>
                      </div>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedCommentId(e.id)}
                        onKeyDown={(ev) => ev.key === "Enter" && setExpandedCommentId(e.id)}
                        className="w-full px-2 py-1.5 text-xs border border-border-md rounded-md bg-surface cursor-pointer text-left min-h-[32px] hover:border-accent/50 focus:outline-none focus:border-accent"
                      >
                        {(e.adminComment ?? "").trim() ? (
                          <span
                            className="block truncate"
                            title={e.adminComment ?? ""}
                          >
                            {e.adminComment}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">관리자 코멘트 입력...</span>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  <select
                    value={e.status || "처리중"}
                    onChange={(ev) => handleStatusChange(e, ev.target.value as "처리중" | "완료")}
                    disabled={!e.roomId}
                    title={!e.roomId ? "상태를 변경할 수 없습니다" : "상태 변경"}
                    className="text-[10px] font-medium px-2 py-1 rounded-md border border-border-md bg-surface cursor-pointer outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="처리중">처리중</option>
                    <option value="완료">완료</option>
                  </select>
                </td>
              </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {emergencies.length > ITEMS_PER_PAGE && (
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
            <div className="text-xs text-text-tertiary">
              총 {emergencies.length}건 중 {startIndex + 1}-{Math.min(endIndex, emergencies.length)}건 표시
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-md border border-border-md bg-surface text-text-secondary hover:bg-bg hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="이전 페이지"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`min-w-[28px] h-7 px-2 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                        currentPage === pageNum
                          ? "bg-accent text-white"
                          : "bg-surface text-text-secondary hover:bg-bg hover:text-text-primary border border-border-md"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-md border border-border-md bg-surface text-text-secondary hover:bg-bg hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="다음 페이지"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

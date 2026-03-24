"use client";

import { useState, useEffect } from "react";
import { getCompanies, getRooms, getMessages, sendMessage } from "@/lib/firebase/firestore";
import { formatDate } from "@/lib/mock-data";
import type { Company, Room, ChatMessage } from "@/lib/types";

export default function NoticePage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [notices, setNotices] = useState<ChatMessage[]>([]);
  const [targetMode, setTargetMode] = useState<"normal" | "summary">("normal");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [content, setContent] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const [companiesData, roomsData] = await Promise.all([
          getCompanies(),
          getRooms(),
        ]);
        setCompanies(companiesData);
        setRooms(roomsData);

        const normalRooms = roomsData.filter((r) => r.id < 998);
        const noticePromises = normalRooms.map((room) =>
          getMessages(room.id.toString(), 50).then((msgs) =>
            msgs.filter((m) => m.type === "notice")
          )
        );
        const allNotices = (await Promise.all(noticePromises)).flat();
        allNotices.sort((a, b) => {
          const dateA = new Date(`${a.date} ${a.time}`).getTime();
          const dateB = new Date(`${b.date} ${b.time}`).getTime();
          return dateB - dateA;
        });
        const seen = new Set<string>();
        const deduped = allNotices.filter((n) => {
          const key = `${n.text}|${n.date}|${n.time}|${n.name ?? n.userId ?? ""}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setNotices(deduped.slice(0, 10));
      } catch (error) {
        console.error("Error loading notice data:", error);
      }
    }
    loadData();
  }, []);

  const normalRooms = rooms.filter((r) => r.id < 998);

  const filteredCompanies = companies.filter((c) => {
    const mode = c.mode ?? "normal";
    return mode === targetMode;
  });

  const toggleCompany = (companyName: string) => {
    setSelectedCompanies((prev) =>
      prev.includes(companyName)
        ? prev.filter((c) => c !== companyName)
        : [...prev, companyName]
    );
  };

  const selectAllCompanies = () => {
    if (selectedCompanies.length === filteredCompanies.length) {
      setSelectedCompanies([]);
    } else {
      setSelectedCompanies(filteredCompanies.map((c) => c.name));
    }
  };

  useEffect(() => {
    const filtered = companies.filter((c) => (c.mode ?? "normal") === targetMode);
    setSelectedCompanies((prev) =>
      prev.filter((name) => filtered.some((c) => c.name === name))
    );
  }, [targetMode, companies]);

  const handleSendNotice = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      alert("공지 내용을 입력해주세요.");
      return;
    }
    if (selectedCompanies.length === 0) {
      alert("발송할 세부 소속을 선택해주세요.");
      return;
    }

    const roomsToSend = normalRooms.filter(
      (r) =>
        r.companies &&
        r.companies.some((c) => selectedCompanies.includes(c))
    );
    if (roomsToSend.length === 0) {
      alert("선택한 소속에 연결된 채팅방이 없습니다.");
      return;
    }

    try {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      await Promise.all(
        roomsToSend.map((room) =>
          sendMessage(room.id.toString(), {
            type: "notice",
            text: trimmedContent,
            name: "관리자",
            date,
            time,
          })
        )
      );

      setContent("");
      const newNotice: ChatMessage = {
        id: `new-${Date.now()}`,
        userId: "admin",
        type: "notice",
        text: trimmedContent,
        name: "관리자",
        date,
        time,
        isMe: false,
      };
      setNotices((prev) => [newNotice, ...prev].slice(0, 10));
      alert("공지가 발송되었습니다.");
    } catch (error) {
      console.error("Error sending notice:", error);
      alert("공지 발송에 실패했습니다.");
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            공지 발송
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            소속·노선별 선택 발송 및 이력 조회
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-3.5">
        {/* Compose */}
        <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-[13px] font-semibold text-text-primary">
              새 공지 작성
            </span>
          </div>

          <div className="mb-3">
            <label className="text-[11px] font-medium text-text-secondary block mb-1.5">
              발송 대상 (소속)
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTargetMode("normal")}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md cursor-pointer transition-colors border ${
                  targetMode === "normal"
                    ? "bg-accent-light text-accent border-accent/30"
                    : "bg-surface text-text-secondary border-border-md hover:bg-bg"
                }`}
              >
                일반 (normal)
              </button>
              <button
                type="button"
                onClick={() => setTargetMode("summary")}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md cursor-pointer transition-colors border ${
                  targetMode === "summary"
                    ? "bg-accent-light text-accent border-accent/30"
                    : "bg-surface text-text-secondary border-border-md hover:bg-bg"
                }`}
              >
                출퇴근 통합 (summary)
              </button>
            </div>
          </div>

          <div className="mb-3">
            <label className="text-[11px] font-medium text-text-secondary block mb-1.5">
              발송 세부 소속
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={selectAllCompanies}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md cursor-pointer transition-colors border ${
                  filteredCompanies.length > 0 &&
                  selectedCompanies.length === filteredCompanies.length
                    ? "bg-accent text-white border-accent"
                    : "bg-surface text-text-secondary border-border-md hover:bg-bg"
                }`}
              >
                전체 선택
              </button>
              {filteredCompanies.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => toggleCompany(c.name)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md cursor-pointer transition-colors border ${
                    selectedCompanies.includes(c.name)
                      ? "bg-accent-light text-accent border-accent/30"
                      : "bg-surface text-text-secondary border-border-md hover:bg-bg"
                  }`}
                >
                  {c.name}
                </button>
              ))}
              {filteredCompanies.length === 0 && (
                <span className="text-[11px] text-text-tertiary py-1">
                  해당 모드의 소속이 없습니다.
                </span>
              )}
            </div>
          </div>

          <div className="mb-3">
            <label className="text-[11px] font-medium text-text-secondary block mb-1.5">
              공지 내용
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="공지 내용을 입력하세요..."
              className="w-full px-3 py-2.5 border border-border-md rounded-md font-sans text-[13px] text-text-primary outline-none focus:border-accent resize-y min-h-[120px] bg-surface"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setContent("")}
              className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-border-md bg-surface text-text-secondary hover:bg-bg cursor-pointer"
            >
              초기화
            </button>
            <button
              onClick={handleSendNotice}
              className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-accent bg-accent text-white hover:bg-accent-dark cursor-pointer"
            >
              발송하기
            </button>
          </div>
        </div>

        {/* History */}
        <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-[13px] font-semibold text-text-primary">
              최근 발송 이력
            </span>
          </div>
          {notices.length === 0 ? (
            <div className="py-6 text-center text-xs text-text-tertiary">
              발송된 공지가 없습니다.
            </div>
          ) : (
            notices.map((notice, i) => (
              <div
                key={notice.id}
                className="flex gap-2.5 py-2 border-b border-border last:border-b-0"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full mt-[5px] shrink-0"
                  style={{
                    background:
                      i === 0
                        ? "var(--color-accent)"
                        : i === 1
                          ? "var(--color-warning)"
                          : "#d1d5db",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary leading-snug">
                    {notice.text && notice.text.length > 30
                      ? notice.text.slice(0, 30) + "..."
                      : notice.text || "공지"}
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">
                    {formatDate(notice.date)} {notice.time} · {notice.name || "관리자"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Trash2, Plus } from "lucide-react";
import { subscribeWorkspaceCalendar, updateWorkspaceCalendarItems } from "@/lib/firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import type { WorkspaceCalendarItem } from "@/lib/types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function itemCoversDate(item: WorkspaceCalendarItem, dateKey: string): boolean {
  const end = item.endDate || item.date;
  return dateKey >= item.date && dateKey <= end;
}

function scheduleRangeEnd(item: WorkspaceCalendarItem): string {
  return item.endDate || item.date;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type Cell = { type: "empty" } | { type: "day"; key: string; d: number };

function padCellsToWeeks(cells: Cell[]): Cell[][] {
  const padded = [...cells];
  while (padded.length % 7 !== 0) padded.push({ type: "empty" });
  const weeks: Cell[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
  return weeks;
}

/** 한 주 안에서 일정이 덮는 열 구간 (없으면 null) */
function weekSegmentForSchedule(
  week: Cell[],
  item: WorkspaceCalendarItem
): { start: number; end: number } | null {
  if (item.kind !== "schedule") return null;
  let minC = -1;
  let maxC = -1;
  for (let c = 0; c < 7; c++) {
    const cell = week[c];
    if (cell.type !== "day") continue;
    if (itemCoversDate(item, cell.key)) {
      if (minC < 0) minC = c;
      maxC = c;
    }
  }
  if (minC < 0) return null;
  return { start: minC, end: maxC };
}

type Segment = {
  item: WorkspaceCalendarItem;
  start: number;
  end: number;
  lane: number;
};

function assignLanes(raw: { item: WorkspaceCalendarItem; start: number; end: number }[]): Segment[] {
  const sorted = [...raw].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneLastEnd: number[] = [];
  return sorted.map((seg) => {
    let lane = 0;
    while (lane < laneLastEnd.length && seg.start <= laneLastEnd[lane]) lane++;
    if (lane === laneLastEnd.length) laneLastEnd.push(seg.end);
    else laneLastEnd[lane] = Math.max(laneLastEnd[lane], seg.end);
    return { ...seg, lane };
  });
}

/** 눈에 잘 띄는 밝은 막대 색 (채도·명도 높음) */
const BAR_PALETTE = [
  "hsl(199 95% 58%)", // 밝은 하늘
  "hsl(280 88% 68%)", // 라벤더
  "hsl(330 90% 68%)", // 핑크
  "hsl(38 96% 58%)", // 골드 앰버
  "hsl(152 72% 48%)", // 민트 그린
  "hsl(24 94% 60%)", // 코랄 오렌지
  "hsl(265 88% 68%)", // 퍼플
  "hsl(173 80% 46%)", // 틸
  "hsl(48 96% 55%)", // 레몬
  "hsl(210 92% 62%)", // 콘플라워 블루
];

function barColorForItem(item: WorkspaceCalendarItem): string {
  let h = 0;
  for (let i = 0; i < item.id.length; i++) h = (h * 31 + item.id.charCodeAt(i)) >>> 0;
  return BAR_PALETTE[h % BAR_PALETTE.length];
}

/** 이 브라우저에서만 읽음 처리 — 팀원 A가 봐도 B 화면의 NEW는 유지 */
const LS_SEEN_IDS = "crewtalk-wc-calendar-seen-ids";
const LS_SEEN_BOOT = "crewtalk-wc-calendar-seen-bootstrapped";
const SEEN_IDS_CAP = 400;

function trimSeenIdList(ids: string[]): string[] {
  return [...new Set(ids)].slice(-SEEN_IDS_CAP);
}

function appendSeenIdToStorage(id: string) {
  try {
    const raw = localStorage.getItem(LS_SEEN_IDS);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    if (arr.includes(id)) return;
    arr.push(id);
    localStorage.setItem(LS_SEEN_IDS, JSON.stringify(arr.slice(-SEEN_IDS_CAP)));
  } catch {
    /* ignore */
  }
}

export default function WorkspaceCalendarPanel() {
  const { isAdminUser } = useAuth();
  const [items, setItems] = useState<WorkspaceCalendarItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const today = useMemo(() => toDateKey(new Date()), []);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(today);

  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<"schedule" | "todo">("todo");
  const [newStartTime, setNewStartTime] = useState("");
  const [rangeStart, setRangeStart] = useState(selectedDate);
  const [rangeEnd, setRangeEnd] = useState(selectedDate);

  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setRangeStart(selectedDate);
    setRangeEnd(selectedDate);
  }, [selectedDate]);

  /** 클라이언트에서 저장된 읽음 ID 복원 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!localStorage.getItem(LS_SEEN_BOOT)) return;
      const raw = localStorage.getItem(LS_SEEN_IDS);
      if (raw) setSeenIds(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  /** 최초 1회: 당시 스냅샷에 있던 항목은 기존 데이터로 간주해 읽음 처리 → 이후 추가분만 NEW */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(LS_SEEN_BOOT)) return;
    if (items.length === 0) return;
    const ids = trimSeenIdList(items.map((i) => i.id));
    try {
      localStorage.setItem(LS_SEEN_IDS, JSON.stringify(ids));
      localStorage.setItem(LS_SEEN_BOOT, "1");
    } catch {
      /* ignore */
    }
    setSeenIds(new Set(ids));
  }, [items]);

  const markCalendarItemSeen = useCallback((id: string) => {
    setSeenIds((prev) => {
      if (prev.has(id)) return prev;
      appendSeenIdToStorage(id);
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const unsub = subscribeWorkspaceCalendar(
      (next) => setItems(next),
      () => setLoadError("달력을 불러오지 못했습니다.")
    );
    return () => unsub();
  }, []);

  const monthLabel = `${viewYear}년 ${viewMonth + 1}월`;

  const calendarCells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startPad = first.getDay();
    const dim = daysInMonth(viewYear, viewMonth);
    const cells: Cell[] = [];
    for (let i = 0; i < startPad; i++) cells.push({ type: "empty" });
    for (let d = 1; d <= dim; d++) {
      const key = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(d)}`;
      cells.push({ type: "day", key, d });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const weeks = useMemo(() => padCellsToWeeks(calendarCells), [calendarCells]);

  const scheduleSegmentsByWeek = useMemo(() => {
    const schedules = items.filter((it) => it.kind === "schedule");
    return weeks.map((week) => {
      const raw = schedules
        .map((item) => {
          const seg = weekSegmentForSchedule(week, item);
          return seg ? { item, start: seg.start, end: seg.end } : null;
        })
        .filter((x): x is { item: WorkspaceCalendarItem; start: number; end: number } => x !== null);
      return assignLanes(raw);
    });
  }, [weeks, items]);

  const dayMarkers = useCallback(
    (dateKey: string) => {
      const dayItems = items.filter((it) => itemCoversDate(it, dateKey));
      const hasTodo = dayItems.some((it) => it.kind === "todo");
      const openTodo = dayItems.some((it) => it.kind === "todo" && !it.done);
      return { hasTodo, openTodo };
    },
    [items]
  );

  const selectedItems = useMemo(() => {
    return items
      .filter((it) => itemCoversDate(it, selectedDate))
      .sort((a, b) => {
        const ta = a.startTime || "";
        const tb = b.startTime || "";
        if (ta !== tb) return ta.localeCompare(tb);
        return a.kind.localeCompare(b.kind);
      });
  }, [items, selectedDate]);

  const selectedLabel = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return `${m}월 ${d}일 (${WEEKDAYS[dt.getDay()]})`;
  }, [selectedDate]);

  const persist = async (next: WorkspaceCalendarItem[]) => {
    if (!isAdminUser) return;
    setSaving(true);
    try {
      await updateWorkspaceCalendarItems(next);
    } catch (e) {
      console.error(e);
      alert("저장에 실패했습니다. 관리자 권한을 확인하세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title || !isAdminUser) return;

    if (newKind === "schedule") {
      if (rangeEnd < rangeStart) {
        alert("종료일은 시작일 이후여야 합니다.");
        return;
      }
    }

    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    let row: WorkspaceCalendarItem;
    if (newKind === "todo") {
      row = {
        id,
        title,
        kind: "todo",
        date: selectedDate,
        ...(newStartTime.trim() ? { startTime: newStartTime.trim() } : {}),
        done: false,
      };
    } else {
      row = {
        id,
        title,
        kind: "schedule",
        date: rangeStart,
        ...(rangeEnd !== rangeStart ? { endDate: rangeEnd } : {}),
        ...(newStartTime.trim() ? { startTime: newStartTime.trim() } : {}),
      };
    }

    await persist([...items, row]);
    markCalendarItemSeen(id);
    setNewTitle("");
    setNewStartTime("");
  };

  const toggleTodo = async (id: string) => {
    markCalendarItemSeen(id);
    if (!isAdminUser) return;
    const next = items.map((it) =>
      it.id === id && it.kind === "todo" ? { ...it, done: !it.done } : it
    );
    await persist(next);
  };

  const removeItem = async (id: string) => {
    if (!isAdminUser) return;
    if (!confirm("이 항목을 삭제할까요?")) return;
    await persist(items.filter((it) => it.id !== id));
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const barRowHeight = 5;
  const barGap = 2;

  return (
    <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm flex flex-col min-h-[360px]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-semibold text-text-primary flex items-center gap-1.5">
          <CalendarDays size={15} className="text-accent shrink-0" />
          팀 업무 달력
          <span className="text-[10px] font-normal text-text-tertiary ml-1">크루 SK팀 일정 공유</span>
        </span>
      </div>

      {loadError && (
        <p className="text-[11px] text-danger mb-2">{loadError}</p>
      )}

      <div className="flex flex-col xl:flex-row flex-1 gap-3 min-h-0">
        {/* Calendar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-md hover:bg-bg border border-transparent hover:border-border cursor-pointer text-text-secondary"
              aria-label="이전 달"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs font-semibold text-text-primary">{monthLabel}</span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-md hover:bg-bg border border-transparent hover:border-border cursor-pointer text-text-secondary"
              aria-label="다음 달"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-px text-center mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-[9px] font-semibold text-text-tertiary py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="rounded-md overflow-hidden border border-border bg-surface flex flex-col divide-y divide-border/25">
            {weeks.map((week, wi) => {
              const segments = scheduleSegmentsByWeek[wi];
              const lanesUsed = segments.reduce((m, s) => Math.max(m, s.lane + 1), 0);

              return (
                <div key={wi} className="flex flex-col gap-px bg-surface">
                  <div className="grid grid-cols-7 gap-px bg-border/20">
                    {week.map((cell, ci) => {
                      if (cell.type === "empty") {
                        return (
                          <div
                            key={`e-${wi}-${ci}`}
                            className="bg-surface aspect-square min-h-[32px]"
                          />
                        );
                      }
                      const { key, d } = cell;
                      const m = dayMarkers(key);
                      const isSelected = key === selectedDate;
                      const isToday = key === today;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedDate(key)}
                          className={`bg-surface aspect-square min-h-[36px] flex flex-col items-center justify-start pt-1 pb-0.5 text-[11px] font-medium transition-colors cursor-pointer border border-transparent hover:bg-bg ${
                            isSelected ? "ring-2 ring-accent ring-inset bg-accent-light/40" : ""
                          } ${isToday && !isSelected ? "text-accent font-bold" : "text-text-primary"}`}
                        >
                          <span>{d}</span>
                          <div className="flex gap-0.5 mt-0.5 justify-center flex-wrap max-w-full px-0.5 min-h-[10px]">
                            {m.hasTodo && (
                              <span
                                className="w-2 h-2 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                                style={{
                                  background: m.openTodo ? "#3b82f6" : "#93c5fd",
                                  boxShadow: m.openTodo ? "0 0 0 1px rgba(59,130,246,0.35)" : "none",
                                }}
                                title="할 일"
                              />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {lanesUsed > 0 && (
                    <div
                      className="grid grid-cols-7 gap-px bg-surface px-px pb-1 pt-0.5"
                      style={{
                        gridTemplateRows: `repeat(${lanesUsed}, ${barRowHeight}px)`,
                        rowGap: barGap,
                      }}
                    >
                      {segments.map((seg) => (
                        <div
                          key={`${seg.item.id}-w${wi}`}
                          className="rounded-sm min-w-0 border border-white/70 shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                          style={{
                            gridColumn: `${seg.start + 1} / ${seg.end + 2}`,
                            gridRow: seg.lane + 1,
                            background: barColorForItem(seg.item),
                            height: barRowHeight,
                            alignSelf: "start",
                          }}
                          title={`${seg.item.title} (${seg.item.date}${seg.item.endDate && seg.item.endDate !== seg.item.date ? ` ~ ${seg.item.endDate}` : ""})`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-2 text-[9px] text-text-secondary flex-wrap">
            <span className="flex items-center gap-1">
              <span
                className="w-4 h-1.5 rounded-sm border border-white/60 shadow-sm"
                style={{ background: BAR_PALETTE[0] }}
              />
              구간 일정 (막대)
            </span>
            <span className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full ring-2 ring-white shadow-sm"
                style={{ background: "#3b82f6" }}
              />
              할 일
            </span>
          </div>
        </div>

        {/* Side panel — selected day */}
        <div
          className="xl:w-[min(100%,280px)] xl:shrink-0 flex flex-col border-t xl:border-t-0 xl:border-l border-border pt-3 xl:pt-0 xl:pl-3 xl:ml-0 min-h-[200px]"
          role="complementary"
          aria-label="선택한 날짜의 일정"
        >
          <div className="text-[12px] font-semibold text-text-primary mb-2">{selectedLabel}</div>
          <div className="flex-1 overflow-y-auto space-y-1.5 mb-3 max-h-[220px] xl:max-h-[260px]">
            {selectedItems.length === 0 ? (
              <p className="text-[11px] text-text-tertiary py-2">등록된 일정·할 일이 없습니다.</p>
            ) : (
              selectedItems.map((it) => {
                const showNew = !seenIds.has(it.id);
                return (
                <div
                  key={it.id}
                  onClick={() => markCalendarItemSeen(it.id)}
                  className="flex items-start gap-2 py-1.5 px-2 rounded-md bg-bg border border-border text-left cursor-pointer hover:border-accent/35"
                >
                  {it.kind === "todo" && isAdminUser ? (
                    <input
                      type="checkbox"
                      checked={!!it.done}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleTodo(it.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 shrink-0 cursor-pointer"
                    />
                  ) : (
                    <span
                      className="w-2 h-2 rounded-sm mt-1.5 shrink-0"
                      style={{ background: barColorForItem(it) }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-1.5 flex-wrap">
                      {showNew && (
                        <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide px-1 py-px rounded bg-rose-500 text-white shadow-sm">
                          New
                        </span>
                      )}
                      <div
                        className={`text-[11px] font-medium text-text-primary leading-snug flex-1 min-w-0 ${
                          it.kind === "todo" && it.done ? "line-through text-text-tertiary" : ""
                        }`}
                      >
                        {it.title}
                      </div>
                    </div>
                    {it.kind === "schedule" && scheduleRangeEnd(it) !== it.date && (
                      <div className="text-[10px] text-text-tertiary mt-0.5">
                        {it.date} ~ {scheduleRangeEnd(it)}
                      </div>
                    )}
                    {(it.startTime || it.endTime) && (
                      <div className="text-[10px] text-text-tertiary mt-0.5">
                        {it.startTime}
                        {it.endTime ? ` – ${it.endTime}` : ""}
                      </div>
                    )}
                    <div className="text-[9px] text-text-tertiary mt-0.5">
                      {it.kind === "schedule" ? "일정" : "할 일"}
                    </div>
                  </div>
                  {isAdminUser && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(it.id);
                      }}
                      className="p-1 text-text-tertiary hover:text-danger cursor-pointer shrink-0"
                      title="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
              })
            )}
          </div>

          {isAdminUser ? (
            <div className="border-t border-border pt-3 space-y-2">
              <div
                className="flex rounded-lg border border-border-md p-0.5 gap-0.5 bg-bg"
                role="group"
                aria-label="항목 유형"
              >
                <button
                  type="button"
                  onClick={() => setNewKind("todo")}
                  className={`flex-1 rounded-md py-2 text-[11px] font-semibold transition-colors cursor-pointer ${
                    newKind === "todo"
                      ? "bg-[#3b82f6] text-white shadow-sm"
                      : "text-text-secondary hover:bg-surface hover:text-text-primary"
                  }`}
                >
                  할 일
                </button>
                <button
                  type="button"
                  onClick={() => setNewKind("schedule")}
                  className={`flex-1 rounded-md py-2 text-[11px] font-semibold transition-colors cursor-pointer ${
                    newKind === "schedule"
                      ? "bg-[var(--color-accent-mid)] text-white shadow-sm"
                      : "text-text-secondary hover:bg-surface hover:text-text-primary"
                  }`}
                >
                  일정 (구간)
                </button>
              </div>

              <div className="text-[10px] font-medium text-text-secondary">항목 추가</div>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="제목"
                className="w-full px-2 py-1.5 border border-border-md rounded-md text-[11px] outline-none focus:border-accent bg-surface"
              />
              <div>
                <label className="text-[9px] text-text-tertiary block mb-0.5">시간 (선택)</label>
                <input
                  type="time"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                  className="w-full px-2 py-1.5 border border-border-md rounded-md text-[11px] bg-surface outline-none focus:border-accent"
                  title="시간 (선택)"
                />
              </div>
              {newKind === "schedule" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-text-tertiary block mb-0.5">시작일</label>
                    <input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="w-full px-1.5 py-1.5 border border-border-md rounded-md text-[11px] bg-surface outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-text-tertiary block mb-0.5">종료일</label>
                    <input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="w-full px-1.5 py-1.5 border border-border-md rounded-md text-[11px] bg-surface outline-none focus:border-accent"
                    />
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving || !newTitle.trim()}
                className="w-full inline-flex items-center justify-center gap-1 px-2 py-2 rounded-md text-[11px] font-medium border border-accent bg-accent text-white hover:bg-accent-dark cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={12} />
                {saving ? "저장 중…" : "추가"}
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-text-tertiary border-t border-border pt-2">
              일정 추가·삭제는 관리자만 가능합니다. 모든 로그인 사용자가 실시간으로 볼 수 있습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

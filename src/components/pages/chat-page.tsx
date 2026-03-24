"use client";

import { useState, useRef, useEffect, Fragment } from "react";
import { Search, Send, Bell } from "lucide-react";
import { getRooms, getMessages, getOlderMessages, sendMessage, subscribeToMessages, subscribeToRoomLastMessage } from "@/lib/firebase/firestore";
import { getAvatarTheme } from "@/lib/mock-data";
import type { Room, ChatMessage } from "@/lib/types";
import ChatReportAnomalyPanel from "@/components/ChatReportAnomalyPanel";

/** 당일: 시간, 전일: 어제, 그 이전: 요일 */
function formatChatListTime(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr || !timeStr) return timeStr ?? "";
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const msgDate = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return timeStr;
  if (diffDays === 1) return "어제";
  if (diffDays < 7) return days[msgDate.getDay()];
  return `${msgDate.getMonth() + 1}/${msgDate.getDate()}`;
}

/** 메시지가 속한 날짜 키 (YYYY-MM-DD) — date 필드 우선, 없으면 createdAt(로컬) */
function getMessageDayKey(msg: ChatMessage): string | null {
  const raw = msg.date?.trim();
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  const ca = msg.createdAt;
  if (ca) {
    const d = ca instanceof Date ? ca : new Date(ca as string | number);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }
  return null;
}

function ChatDateSeparator({ dayKey }: { dayKey: string }) {
  const parts = dayKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, mo, da] = parts;
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const label = `${y}년 ${mo}월 ${da}일 ${days[new Date(y, mo - 1, da).getDay()]}요일`;
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] text-text-tertiary shrink-0">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const theme = getAvatarTheme(msg.name);

  if (msg.type === "notice") {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-accent-light text-accent text-[11px] font-medium px-4 py-2 rounded-lg max-w-[80%] text-center">
          <div className="font-semibold mb-0.5">공지</div>
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.type === "report" && msg.reportData) {
    const count = msg.reportData.count;
    const isFull = [41, 44, 45].includes(count);
    const countDisplay = isFull ? `${count}명 만차` : `${count}명`;
    const parts = [msg.car, msg.route, msg.subRoute, countDisplay].filter(Boolean);
    const lineText = parts.join(", ");
    return (
      <div className="flex gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5"
          style={{ background: theme.bg, color: theme.fg }}
        >
          {msg.avatar || msg.name.charAt(0)}
        </div>
        <div className="max-w-[70%]">
          <div className="text-[10px] text-text-tertiary mb-0.5">
            {msg.name} · {msg.time}
          </div>
          <div className="bg-blue-light border border-blue/10 rounded-lg px-3 py-2">
            <div className="text-[11px] font-semibold text-blue mb-1">
              {msg.reportData.type === "출근" ? "🌅" : "🌙"}{" "}
              {msg.reportData.type} 인원보고
            </div>
            <div className="text-xs text-text-primary">
              {lineText}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (msg.type === "emergency") {
    const parts = [msg.name, msg.phone, msg.route, msg.car].filter(Boolean);
    const lineText = parts.join(", ");
    return (
      <div className="flex gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5"
          style={{ background: theme.bg, color: theme.fg }}
        >
          {msg.avatar || msg.name.charAt(0)}
        </div>
        <div className="max-w-[70%]">
          <div className="text-[10px] text-text-tertiary mb-0.5">
            {msg.name} · {msg.time}
          </div>
          <div className="bg-danger-light border border-red-200 rounded-lg px-3 py-2">
            <div className="text-[11px] font-semibold text-danger mb-1">
              🚨 긴급호출 {msg.emergencyType}
            </div>
            <div className="text-xs text-red-600">
              {lineText || "—"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 관리자 웹에서는 관리자(본인) 메시지를 오른쪽, 그 외는 왼쪽에 표시
  const isAdminMessage = msg.name === "관리자" || msg.userId === "admin";
  if (isAdminMessage) {
    return (
      <div className="flex justify-end mb-2">
        <div className="max-w-[70%]">
          <div className="text-[10px] text-text-tertiary mb-0.5 text-right">
            {msg.name} · {msg.time}
          </div>
          <div className="bg-accent-mid text-white rounded-lg px-3 py-2 text-xs leading-relaxed">
            {msg.text}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 mb-2">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5"
        style={{ background: theme.bg, color: theme.fg }}
      >
        {msg.avatar || msg.name.charAt(0)}
      </div>
      <div className="max-w-[70%]">
        <div className="text-[10px] text-text-tertiary mb-0.5">
          {msg.name} · {msg.time}
        </div>
        <div className="bg-bg rounded-lg px-3 py-2 text-xs text-text-primary leading-relaxed">
          {msg.text}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [inputText, setInputText] = useState("");
  const [messagesLatest, setMessagesLatest] = useState<ChatMessage[]>([]);
  const [messagesOlder, setMessagesOlder] = useState<ChatMessage[]>([]);
  const messages = [...messagesOlder, ...messagesLatest];
  const [messageType, setMessageType] = useState<"text" | "notice">("text");
  const [isSending, setIsSending] = useState(false);
  const [roomLastMessage, setRoomLastMessage] = useState<Record<string, { lastMsg: string; time: string; date: string | null }>>({});
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const initialLoadDoneRef = useRef<Record<string, boolean>>({});
  const selectedRoomRef = useRef<number | null>(selectedRoom);
  const roomsRef = useRef<Room[]>(rooms);
  const loadingOlderRef = useRef(false);
  const hasMoreOlderRef = useRef(true);
  selectedRoomRef.current = selectedRoom;
  roomsRef.current = rooms;

  useEffect(() => {
    async function loadRooms() {
      try {
        const roomsData = await getRooms();
        setRooms(roomsData);
      } catch (error) {
        console.error("Error loading rooms:", error);
      }
    }
    loadRooms();
  }, []);

  const normalRoomIds = rooms.filter((r) => r.id < 998).map((r) => r.id).join(",");

  // 각 채팅방별 최신 메시지 실시간 구독
  useEffect(() => {
    const normalRooms = roomsRef.current.filter((r) => r.id < 998);
    if (normalRooms.length === 0) return;

    const unsubscribes = normalRooms.map((room) =>
      subscribeToRoomLastMessage(String(room.id), (lastMsg, time, date) => {
        const rid = String(room.id);
        const isInitial = !initialLoadDoneRef.current[rid];
        if (isInitial) initialLoadDoneRef.current[rid] = true;

        setRoomLastMessage((prev) => ({
          ...prev,
          [rid]:
            lastMsg != null && time != null
              ? { lastMsg, time, date: date ?? null }
              : prev[rid] ?? { lastMsg: room.lastMsg ?? "", time: room.time ?? "", date: null },
        }));
        // 초기 로드 제외, 새 메시지가 왔을 때 선택 중인 채팅방이 아니면 미읽음 +1
        if (!isInitial && lastMsg != null && String(selectedRoomRef.current) !== rid) {
          setUnreadByRoom((prev) => ({ ...prev, [rid]: (prev[rid] ?? 0) + 1 }));
        }
      })
    );
    return () => unsubscribes.forEach((u) => u());
  }, [normalRoomIds]);

  const didPrependOlderRef = useRef(false);

  // 채팅방 열릴 때/새 메시지 시 맨 아래로 스크롤 (이전 메시지 로드 시에는 스크롤 유지)
  useEffect(() => {
    if (messages.length === 0) return;
    if (didPrependOlderRef.current) {
      didPrependOlderRef.current = false;
      return;
    }
    const el = messagesScrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, selectedRoom]);

  useEffect(() => {
    if (!selectedRoom) {
      setMessagesLatest([]);
      setMessagesOlder([]);
      hasMoreOlderRef.current = true;
      return;
    }
    const roomId = selectedRoom;
    setMessagesOlder([]);
    hasMoreOlderRef.current = true;

    async function loadMessages() {
      try {
        const msgs = await getMessages(roomId.toString());
        setMessagesLatest(msgs);
      } catch (error) {
        console.error("Error loading messages:", error);
      }
    }

    loadMessages();

    const unsubscribe = subscribeToMessages(roomId.toString(), (newMessages) => {
      setMessagesLatest(newMessages);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedRoom]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedRoom || isSending) return;

    setIsSending(true);
    const textToSend = inputText.trim();
    const typeToSend = messageType;
    setInputText("");
    setMessageType("text");

    try {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      await sendMessage(selectedRoom.toString(), {
        type: typeToSend,
        text: textToSend,
        name: "관리자",
        date,
        time,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setInputText(textToSend);
      setMessageType(typeToSend);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!e.nativeEvent.isComposing) {
        handleSend();
      }
    }
  };

  const handleScrollMessages = () => {
    const el = messagesScrollRef.current;
    if (!el || !selectedRoom || loadingOlderRef.current || !hasMoreOlderRef.current) return;
    if (el.scrollTop > 80) return; // 상단 근처에서만 이전 메시지 로드

    const oldestMsg = messages[0];
    if (!oldestMsg?.createdAt) return;

    loadingOlderRef.current = true;
    const beforeDate = oldestMsg.createdAt instanceof Date ? oldestMsg.createdAt : new Date(oldestMsg.createdAt);
    const prevScrollHeight = el.scrollHeight;

    getOlderMessages(selectedRoom.toString(), beforeDate)
      .then((older) => {
        if (older.length === 0) hasMoreOlderRef.current = false;
        else {
          didPrependOlderRef.current = true;
          setMessagesOlder((prev) => [...older, ...prev]);
          requestAnimationFrame(() => {
            if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
          });
        }
      })
      .finally(() => {
        loadingOlderRef.current = false;
      });
  };

  const normalRooms = rooms.filter((r) => r.id < 998);
  const filteredRooms = normalRooms.filter(
    (r) => r.name.includes(searchQuery),
  );

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            채팅 모니터링
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            채팅방별 실시간 메시지 열람 및 발송
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[280px_1fr_1fr] gap-3.5 h-[calc(100vh-260px)] min-h-[400px]">
        {/* Room List */}
        <div className="bg-surface border border-border rounded-[10px] p-3 shadow-sm flex flex-col min-h-0">
          <div className="relative mb-3">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              placeholder="채팅방 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-border-md rounded-md font-sans text-xs text-text-primary outline-none focus:border-accent bg-surface"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {filteredRooms.map((room) => {
              const rid = String(room.id);
              const live = roomLastMessage[rid];
              const lastMsg = live?.lastMsg ?? room.lastMsg ?? "";
              const timeStr = live?.time ?? room.time ?? "";
              const dateStr = live?.date ?? null;
              const timeDisplay = formatChatListTime(dateStr, timeStr);
              const unread = unreadByRoom[rid] ?? 0;
              return (
                <button
                  key={room.id}
                  onClick={() => {
                    setSelectedRoom(room.id);
                    setUnreadByRoom((prev) => ({ ...prev, [rid]: 0 }));
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-md cursor-pointer transition-all relative ${
                    selectedRoom === room.id
                      ? "bg-accent-light"
                      : "hover:bg-bg"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-xs font-medium ${selectedRoom === room.id ? "text-accent" : "text-text-primary"} ${unread > 0 ? "font-semibold" : ""}`}
                      >
                        {room.name}
                      </div>
                      <div className="text-[10px] text-text-tertiary mt-0.5 truncate">
                        {lastMsg || "메시지 없음"}
                        {timeDisplay && ` · ${timeDisplay}`}
                      </div>
                    </div>
                    {unread > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-danger text-white text-[10px] font-bold">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat Messages */}
        <div className="bg-surface border border-border rounded-[10px] shadow-sm flex flex-col min-h-0">
          {selectedRoom ? (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-text-primary">
                    {rooms.find((r) => r.id === selectedRoom)?.name || "채팅방"}
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">
                    {rooms
                      .find((r) => r.id === selectedRoom)
                      ?.companies?.join(", ") || "전체"}
                  </div>
                </div>
                <span className="text-[10px] text-accent bg-accent-light px-2 py-1 rounded font-medium">
                  관리자
                </span>
              </div>
              <div
                ref={messagesScrollRef}
                onScroll={handleScrollMessages}
                className="flex-1 overflow-y-auto px-4 py-3"
              >
                {messages.length > 0 &&
                  messages.map((msg, i) => {
                    const dayKey = getMessageDayKey(msg);
                    const prevKey = i > 0 ? getMessageDayKey(messages[i - 1]) : null;
                    const showDateSep = dayKey != null && dayKey !== prevKey;
                    return (
                      <Fragment key={msg.id}>
                        {showDateSep && <ChatDateSeparator dayKey={dayKey} />}
                        <MessageBubble msg={msg} />
                      </Fragment>
                    );
                  })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="px-4 py-3 border-t border-border">
                {messageType === "notice" && (
                  <div className="flex items-center gap-1.5 mb-2 text-[10px] text-accent bg-accent-light px-2.5 py-1.5 rounded-md">
                    <Bell size={11} />
                    <span className="font-medium">공지 모드</span>
                    <span className="text-text-tertiary">— 이 메시지는 공지로 전송됩니다</span>
                    <button
                      onClick={() => setMessageType("text")}
                      className="ml-auto text-text-tertiary hover:text-text-primary cursor-pointer text-[10px]"
                    >
                      취소
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => setMessageType(messageType === "notice" ? "text" : "notice")}
                    title="공지로 전환"
                    className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-md border transition-colors cursor-pointer ${
                      messageType === "notice"
                        ? "bg-accent-light border-accent/30 text-accent"
                        : "border-border-md text-text-tertiary hover:bg-bg hover:text-text-primary"
                    }`}
                  >
                    <Bell size={14} />
                  </button>
                  <div className="flex-1 relative">
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="메시지를 입력하세요... (Enter로 전송, Shift+Enter로 줄바꿈)"
                      rows={1}
                      className="w-full px-3 py-2 border border-border-md rounded-lg font-sans text-[13px] text-text-primary outline-none focus:border-accent bg-surface resize-none max-h-[100px]"
                      style={{ minHeight: "36px" }}
                    />
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || isSending}
                    className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                      inputText.trim()
                        ? "bg-accent text-white hover:bg-accent-dark"
                        : "bg-bg text-text-tertiary cursor-not-allowed"
                    }`}
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl mb-2">💬</div>
                <div className="text-sm text-text-tertiary">
                  채팅방을 선택해 주세요
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 우측: 인원보고 구간별 이상 감지 */}
        <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm flex flex-col min-h-0 overflow-hidden">
          <ChatReportAnomalyPanel rooms={normalRooms} />
        </div>
      </div>
    </div>
  );
}

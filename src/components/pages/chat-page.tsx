"use client";

import { useState, useRef, useEffect, Fragment, useCallback, useMemo } from "react";
import { Search, Send, ImagePlus } from "lucide-react";
import { getRooms, getMessages, getOlderMessages, sendMessage, subscribeToMessages, subscribeToRoomLastMessage } from "@/lib/firebase/firestore";
import { uploadChatImage } from "@/lib/firebase/storage-chat";
import {
  getCachedMessagesForRoom,
  saveCachedMessagesForRoom,
  getCachedImage,
  saveCachedImage,
  mergeMessagesById,
  mergedToSlices,
} from "@/lib/chat-cache";
import { getAvatarTheme } from "@/lib/mock-data";
import type { Room, ChatMessage } from "@/lib/types";
import { isMaintenanceLikeType, messageBodyForDisplay } from "@/lib/chat-message-body";
import ChatReportAnomalyPanel from "@/components/ChatReportAnomalyPanel";
import { useAuth } from "@/contexts/AuthContext";

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 당일: 채팅 시간, 어제: 어제, 그 이전: M월D일 */
function formatChatListTime(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return "";
  const msgYmd = dateStr.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(msgYmd)) return timeStr?.trim() ?? "";

  const todayYmd = localYmd(new Date());
  if (msgYmd === todayYmd) return (timeStr ?? "").trim();

  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (msgYmd === localYmd(y)) return "어제";

  const [, mo, da] = msgYmd.split("-").map((s) => parseInt(s, 10));
  if (Number.isNaN(mo) || Number.isNaN(da)) return "";
  return `${mo}월${da}일`;
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

/** Firestore에서 정규화된 imageUrl 또는 https URL */
function chatImageUrl(msg: ChatMessage): string | null {
  const u = (msg.imageUrl || "").trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  return null;
}

function isImageCompatibleType(type: string | undefined): boolean {
  const t = (type || "").toLowerCase();
  return t === "image" || t === "text" || t === "photo" || t === "picture";
}

function ChatMessageImage({
  roomId,
  messageId,
  remoteSrc,
}: {
  roomId: string | null;
  messageId: string;
  remoteSrc: string;
}) {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const revokedRef = useRef<string | null>(null);
  const onError = useCallback(() => setBroken(true), []);

  useEffect(() => {
    setBroken(false);
    if (!roomId) {
      setDisplaySrc(remoteSrc);
      return;
    }
    let cancelled = false;
    const prev = revokedRef.current;
    if (prev) {
      URL.revokeObjectURL(prev);
      revokedRef.current = null;
    }

    (async () => {
      const blob = await getCachedImage(roomId, messageId);
      if (cancelled) return;
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        revokedRef.current = url;
        setDisplaySrc(url);
        return;
      }
      try {
        const res = await fetch(remoteSrc, { mode: "cors", credentials: "omit" });
        if (!res.ok) throw new Error(String(res.status));
        const b = await res.blob();
        if (cancelled) return;
        await saveCachedImage(roomId, messageId, b);
        const url = URL.createObjectURL(b);
        revokedRef.current = url;
        setDisplaySrc(url);
      } catch {
        if (!cancelled) setDisplaySrc(remoteSrc);
      }
    })();

    return () => {
      cancelled = true;
      const u = revokedRef.current;
      if (u) {
        URL.revokeObjectURL(u);
        revokedRef.current = null;
      }
    };
  }, [roomId, messageId, remoteSrc]);

  const src = displaySrc ?? remoteSrc;
  if (broken) {
    return (
      <div className="text-[11px] text-text-tertiary py-3 px-2 bg-bg rounded-lg border border-border text-center">
        이미지를 불러올 수 없습니다.
      </div>
    );
  }
  return (
    // Firebase Storage 등 동적 URL — next/image 도메인 등록 없이 표시
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="rounded-md border border-border max-w-full max-h-[min(50vh,320px)] w-auto object-contain bg-bg"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}

function ImageBubbleBody({
  msg,
  url,
  roomId,
}: {
  msg: ChatMessage;
  url: string;
  roomId: string | null;
}) {
  const caption = msg.text?.trim();
  return (
    <div className="bg-bg rounded-lg px-2 py-2 border border-border overflow-hidden">
      <ChatMessageImage roomId={roomId} messageId={msg.id} remoteSrc={url} />
      {caption ? (
        <div className="text-xs text-text-primary leading-relaxed mt-2 px-1 whitespace-pre-wrap break-words">
          {caption}
        </div>
      ) : null}
    </div>
  );
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

function MessageBubble({
  msg,
  roomId,
  consoleUserId,
}: {
  msg: ChatMessage;
  roomId: string | null;
  /** 웹 콘솔 로그인 사용자 UID — 본인 전송 메시지(오른쪽 정렬) 판별 */
  consoleUserId: string | null;
}) {
  const theme = getAvatarTheme(msg.name);

  if (msg.type === "notice") {
    const displayName = (msg.name || "").trim() || "관리자";
    const noticeTheme = getAvatarTheme(displayName);
    const isOwnNotice =
      (consoleUserId != null && msg.userId === consoleUserId) ||
      msg.name === "관리자" ||
      msg.userId === "admin";
    const noticeBody = (
      <div className="bg-accent-light border border-accent/20 rounded-lg px-3 py-2 text-left">
        <div className="text-[11px] font-semibold text-accent mb-1">공지</div>
        <div className="text-xs text-text-primary whitespace-pre-wrap break-words">
          {msg.text || "—"}
        </div>
      </div>
    );
    if (isOwnNotice) {
      return (
        <div className="flex justify-end mb-2">
          <div className="max-w-[70%]">
            <div className="text-[10px] text-text-tertiary mb-0.5 text-right">
              {displayName} · {msg.time || "—"}
            </div>
            {noticeBody}
          </div>
        </div>
      );
    }
    return (
      <div className="flex gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5"
          style={{ background: noticeTheme.bg, color: noticeTheme.fg }}
        >
          {msg.avatar || displayName.charAt(0)}
        </div>
        <div className="max-w-[70%]">
          <div className="text-[10px] text-text-tertiary mb-0.5">
            {displayName} · {msg.time || "—"}
          </div>
          {noticeBody}
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

  const raw = msg as unknown as Record<string, unknown>;
  if (isMaintenanceLikeType(msg.type)) {
    const structured = messageBodyForDisplay(raw);
    const metaParts = [msg.name, msg.phone, msg.route, msg.car].filter(Boolean);
    const lineText = structured || metaParts.join(", ") || "—";
    return (
      <div className="flex gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5"
          style={{ background: theme.bg, color: theme.fg }}
        >
          {msg.avatar || msg.name.charAt(0)}
        </div>
        <div className="max-w-[min(70%,420px)]">
          <div className="text-[10px] text-text-tertiary mb-0.5">
            {msg.name} · {msg.time}
          </div>
          <div className="bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2 dark:bg-amber-950/30 dark:border-amber-800/60">
            <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-200 mb-1">
              🔧 정비·예약
            </div>
            <div className="text-xs text-amber-900/90 dark:text-amber-100/90 whitespace-pre-wrap break-words">
              {lineText}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const imgUrl = chatImageUrl(msg);
  const showImage = Boolean(imgUrl && isImageCompatibleType(msg.type));

  // 웹 콘솔에서 보낸 메시지: userId 가 현재 로그인 UID 와 같거나, 레거시(이름 관리자 / userId admin)
  const isOwnConsoleMessage =
    (consoleUserId != null && msg.userId === consoleUserId) ||
    msg.name === "관리자" ||
    msg.userId === "admin";
  if (isOwnConsoleMessage) {
    if (showImage && imgUrl) {
      return (
        <div className="flex justify-end mb-2">
          <div className="max-w-[min(70%,420px)]">
            <div className="text-[10px] text-text-tertiary mb-0.5 text-right">
              {msg.name} · {msg.time}
            </div>
            <ImageBubbleBody msg={msg} url={imgUrl} roomId={roomId} />
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-end mb-2">
        <div className="max-w-[70%]">
          <div className="text-[10px] text-text-tertiary mb-0.5 text-right">
            {msg.name} · {msg.time}
          </div>
          <div className="bg-accent-mid text-white rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words">
            {msg.text}
          </div>
        </div>
      </div>
    );
  }

  if (showImage && imgUrl) {
    return (
      <div className="flex gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5"
          style={{ background: theme.bg, color: theme.fg }}
        >
          {msg.avatar || msg.name.charAt(0)}
        </div>
        <div className="max-w-[min(70%,420px)]">
          <div className="text-[10px] text-text-tertiary mb-0.5">
            {msg.name} · {msg.time}
          </div>
          <ImageBubbleBody msg={msg} url={imgUrl} roomId={roomId} />
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
        <div className="bg-bg rounded-lg px-3 py-2 text-xs text-text-primary leading-relaxed whitespace-pre-wrap break-words">
          {msg.text?.trim() ||
            messageBodyForDisplay(raw) ||
            ((msg.type || "").toLowerCase() === "image" ? "사진(표시할 주소 없음)" : "")}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const senderName = (user?.name ?? "").trim() || "관리자";
  const consoleUserId = user?.uid ?? null;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [inputText, setInputText] = useState("");
  const [chatSlices, setChatSlices] = useState<{ older: ChatMessage[]; latest: ChatMessage[] }>({
    older: [],
    latest: [],
  });
  const messages = useMemo(
    () => [...chatSlices.older, ...chatSlices.latest],
    [chatSlices.older, chatSlices.latest]
  );
  const [isSending, setIsSending] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chatDragDepthRef = useRef(0);
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
      setChatSlices({ older: [], latest: [] });
      hasMoreOlderRef.current = true;
      return;
    }
    const roomIdStr = String(selectedRoom);
    hasMoreOlderRef.current = true;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const cached = await getCachedMessagesForRoom(roomIdStr);
        if (cancelled) return;
        if (cached?.length) {
          setChatSlices(mergedToSlices(cached));
        }
        const fromServer = await getMessages(roomIdStr);
        if (cancelled) return;
        const merged = mergeMessagesById(cached ?? [], fromServer);
        setChatSlices(mergedToSlices(merged));

        unsubscribe = subscribeToMessages(roomIdStr, (new50) => {
          if (cancelled) return;
          setChatSlices((prev) => {
            const combined = mergeMessagesById([...prev.older, ...prev.latest], new50);
            return mergedToSlices(combined);
          });
        });
      } catch (error) {
        if (!cancelled) console.error("Error loading messages:", error);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [selectedRoom]);

  useEffect(() => {
    chatDragDepthRef.current = 0;
    setIsDraggingOverChat(false);
  }, [selectedRoom]);

  /** 메시지·이미지 재방문 시 IndexedDB에 유지 (디바운스) */
  useEffect(() => {
    if (!selectedRoom) return;
    const merged = [...chatSlices.older, ...chatSlices.latest];
    if (merged.length === 0) return;
    const rid = String(selectedRoom);
    const t = window.setTimeout(() => {
      void saveCachedMessagesForRoom(rid, merged);
    }, 500);
    return () => window.clearTimeout(t);
  }, [chatSlices, selectedRoom]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedRoom || isSending) return;

    setIsSending(true);
    const textToSend = inputText.trim();
    setInputText("");

    try {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      await sendMessage(selectedRoom.toString(), {
        type: "text",
        text: textToSend,
        name: senderName,
        date,
        time,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setInputText(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  const handleImageFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || !selectedRoom || isUploadingImage) return;
      const images = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) {
        alert("이미지 파일만 업로드할 수 있습니다.");
        return;
      }
      const captionFirst = inputText.trim();
      setIsUploadingImage(true);
      try {
        const roomIdStr = selectedRoom.toString();

        for (let i = 0; i < images.length; i++) {
          const url = await uploadChatImage(roomIdStr, images[i]);
          const now = new Date();
          const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          await sendMessage(roomIdStr, {
            type: "image",
            imageUrl: url,
            text: i === 0 && captionFirst ? captionFirst : undefined,
            name: senderName,
            date,
            time,
          });
        }
        if (captionFirst) setInputText("");
      } catch (e) {
        console.error(e);
        const msg = e instanceof Error ? e.message : "이미지 업로드에 실패했습니다.";
        alert(msg);
      } finally {
        setIsUploadingImage(false);
      }
    },
    [selectedRoom, isUploadingImage, inputText, senderName]
  );

  const onChatDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
    chatDragDepthRef.current += 1;
    setIsDraggingOverChat(true);
  }, []);

  const onChatDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    chatDragDepthRef.current -= 1;
    if (chatDragDepthRef.current <= 0) {
      chatDragDepthRef.current = 0;
      setIsDraggingOverChat(false);
    }
  }, []);

  const onChatDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onChatDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      chatDragDepthRef.current = 0;
      setIsDraggingOverChat(false);
      if (!selectedRoom || isUploadingImage) return;
      void handleImageFiles(e.dataTransfer.files);
    },
    [selectedRoom, isUploadingImage, handleImageFiles]
  );

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
          setChatSlices((prev) => {
            const combined = mergeMessagesById(older, [...prev.older, ...prev.latest]);
            return mergedToSlices(combined);
          });
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
            채팅방별 실시간 열람·텍스트 전송·사진 업로드(버튼·드래그) · 열람한 메시지·이미지는 브라우저에 캐시됩니다
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
            <div
              className={`flex flex-col flex-1 min-h-0 relative ${isDraggingOverChat ? "ring-2 ring-accent ring-inset rounded-[10px]" : ""}`}
              onDragEnter={onChatDragEnter}
              onDragLeave={onChatDragLeave}
              onDragOver={onChatDragOver}
              onDrop={onChatDrop}
            >
              {isDraggingOverChat && (
                <div
                  className="absolute inset-0 z-20 bg-accent/8 border-2 border-dashed border-accent rounded-[8px] m-1 flex items-center justify-center pointer-events-none"
                  aria-hidden
                >
                  <span className="text-xs font-medium text-accent bg-surface/90 px-3 py-2 rounded-md shadow-sm">
                    이미지를 여기에 놓으면 업로드됩니다
                  </span>
                </div>
              )}
              <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
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
                <span className="text-[10px] text-accent bg-accent-light px-2 py-1 rounded font-medium max-w-[140px] truncate" title={senderName}>
                  {senderName}
                </span>
              </div>
              <div
                ref={messagesScrollRef}
                onScroll={handleScrollMessages}
                className="flex-1 overflow-y-auto px-4 py-3 min-h-0"
              >
                {messages.length > 0 &&
                  messages.map((msg, i) => {
                    const dayKey = getMessageDayKey(msg);
                    const prevKey = i > 0 ? getMessageDayKey(messages[i - 1]) : null;
                    const showDateSep = dayKey != null && dayKey !== prevKey;
                    return (
                      <Fragment key={msg.id}>
                        {showDateSep && <ChatDateSeparator dayKey={dayKey} />}
                        <MessageBubble
                          msg={msg}
                          roomId={String(selectedRoom)}
                          consoleUserId={consoleUserId}
                        />
                      </Fragment>
                    );
                  })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="px-4 py-3 border-t border-border shrink-0">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  aria-hidden
                  onChange={(e) => {
                    void handleImageFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isUploadingImage}
                    title="사진 업로드"
                    className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md border border-border-md text-text-tertiary hover:bg-bg hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ImagePlus size={16} />
                  </button>
                  <div className="flex-1 relative min-w-0">
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="메시지 또는 사진 캡션… (Enter로 전송, Shift+Enter로 줄바꿈)"
                      rows={1}
                      className="w-full min-h-9 px-3 py-2 border border-border-md rounded-lg font-sans text-[13px] text-text-primary outline-none focus:border-accent bg-surface resize-none max-h-[100px] leading-[1.35]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!inputText.trim() || isSending}
                    className={`shrink-0 h-9 w-9 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                      inputText.trim()
                        ? "bg-accent text-white hover:bg-accent-dark"
                        : "bg-bg text-text-tertiary cursor-not-allowed"
                    }`}
                  >
                    <Send size={14} />
                  </button>
                </div>
                {(isUploadingImage || isSending) && (
                  <p className="text-[10px] text-text-tertiary mt-1.5">
                    {isUploadingImage ? "이미지 업로드 중…" : "전송 중…"}
                  </p>
                )}
              </div>
            </div>
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

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, X, ImagePlus } from "lucide-react";
import { getRooms, patchRoomTimetableSlot } from "@/lib/firebase/firestore";
import { uploadTimetableImage } from "@/lib/firebase/storage-chat";
import type { Room } from "@/lib/types";

const MAX_PER_SLOT = 20;

export type TimetableSlot = 1 | 2;

function isRemoteImageSource(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\//i.test(t) || t.startsWith("data:image") || t.startsWith("blob:");
}

/** 앱과 동일: 분리 필드가 있으면 해당 배열만, 없으면 슬롯1에만 timetableImages */
function getSlotImages(room: Room, slot: TimetableSlot): string[] {
  if (room.timetableUsesSplitFields) {
    return slot === 1 ? (room.timetable1Images ?? []) : (room.timetable2Images ?? []);
  }
  return slot === 1 ? (room.timetableImages ?? []) : [];
}

export default function DispatchPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSlot, setActiveSlot] = useState<TimetableSlot>(1);
  const [loading, setLoading] = useState(true);
  const [uploadingRoomId, setUploadingRoomId] = useState<number | null>(null);
  const [dragRoomId, setDragRoomId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickRoomId, setPickRoomId] = useState<number | null>(null);

  const loadRooms = useCallback(async () => {
    try {
      const data = await getRooms();
      setRooms(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const dispatchRooms = rooms.filter(
    (r) =>
      r.id < 998 &&
      (r.name.includes(searchQuery.trim()) ||
        r.companies?.some((c) => c.includes(searchQuery.trim())) ||
        searchQuery.trim() === "")
  );

  const openFilePicker = (roomId: number) => {
    setPickRoomId(roomId);
    requestAnimationFrame(() => fileInputRef.current?.click());
  };

  const handleFilesForRoom = async (room: Room, fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      alert("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    const current = getSlotImages(room, activeSlot);
    const remaining = MAX_PER_SLOT - current.length;
    if (remaining <= 0) {
      alert(`배차표${activeSlot}당 최대 ${MAX_PER_SLOT}장까지 등록할 수 있습니다.`);
      return;
    }

    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      alert(`한 번에 최대 ${remaining}장만 추가됩니다. (슬롯당 총 ${MAX_PER_SLOT}장 제한)`);
    }

    setUploadingRoomId(room.id);
    try {
      const urls: string[] = [];
      for (const file of toUpload) {
        const url = await uploadTimetableImage(String(room.id), file);
        urls.push(url);
      }
      const next = [...current, ...urls];
      await patchRoomTimetableSlot(room.id, activeSlot, next);
      await loadRooms();
    } catch (e: unknown) {
      console.error(e);
      const err = e as { message?: string };
      alert(err?.message || "업로드에 실패했습니다. 권한과 네트워크를 확인하세요.");
    } finally {
      setUploadingRoomId(null);
    }
  };

  const removeImageAt = async (room: Room, index: number) => {
    const current = [...getSlotImages(room, activeSlot)];
    current.splice(index, 1);
    setUploadingRoomId(room.id);
    try {
      await patchRoomTimetableSlot(room.id, activeSlot, current);
      await loadRooms();
    } catch (e) {
      console.error(e);
      alert("삭제 저장에 실패했습니다.");
    } finally {
      setUploadingRoomId(null);
    }
  };

  const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rid = pickRoomId;
    const list = e.target.files;
    e.target.value = "";
    setPickRoomId(null);
    if (rid == null || !list?.length) return;
    const room = rooms.find((r) => r.id === rid);
    if (!room) return;
    await handleFilesForRoom(room, list);
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">배차표 관리</h1>
        <p className="text-xs text-text-tertiary mt-1 max-w-2xl">
          아래에서 <strong className="text-text-secondary">배차표1 · 배차표2</strong> 중 하나를 고른 뒤, 해당 슬롯으로만 이미지가 저장됩니다. 앱 헤더에는 이미지가 있는 슬롯만 버튼이
          보입니다. 슬롯당 최대 {MAX_PER_SLOT}장 · Storage URL이 Firestore에 반영됩니다.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onInputChange}
      />

      <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm mb-4 flex flex-wrap items-center gap-4">
        <div className="relative max-w-md flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            placeholder="채팅방 이름, 소속 검색…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-border-md rounded-md font-sans text-[13px] text-text-primary outline-none focus:border-accent bg-surface"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-medium text-text-tertiary whitespace-nowrap">업로드 슬롯</span>
          <div className="inline-flex rounded-lg border border-border-md p-0.5 bg-bg">
            <button
              type="button"
              onClick={() => setActiveSlot(1)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                activeSlot === 1
                  ? "bg-surface text-accent border border-accent shadow-sm"
                  : "text-text-secondary hover:text-text-primary border border-transparent"
              }`}
            >
              배차표1
            </button>
            <button
              type="button"
              onClick={() => setActiveSlot(2)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                activeSlot === 2
                  ? "bg-surface text-accent border border-accent shadow-sm"
                  : "text-text-secondary hover:text-text-primary border border-transparent"
              }`}
            >
              배차표2
            </button>
          </div>
        </div>
      </div>

      {activeSlot === 1 ? (
        <p className="text-[11px] text-text-secondary mb-3 -mt-1">
          채팅방 상단 <span className="font-medium text-text-primary">배차표1</span>으로 열립니다.
        </p>
      ) : (
        <p className="text-[11px] text-text-secondary mb-3 -mt-1">
          채팅방 상단 <span className="font-medium text-text-primary">배차표2</span>로 두 번째 시간표를 따로 둡니다.
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-tertiary text-sm gap-2">
          <Loader2 className="animate-spin" size={18} />
          불러오는 중…
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {dispatchRooms.map((room) => {
            const images = getSlotImages(room, activeSlot);
            const count = images.length;
            const busy = uploadingRoomId === room.id;
            const isDropTarget = dragRoomId === room.id;

            return (
              <div
                key={`${room.id}-${activeSlot}`}
                className={`bg-surface border rounded-[10px] p-3 shadow-sm transition-colors min-w-0 flex flex-col ${
                  isDropTarget ? "border-accent border-dashed bg-accent-light/30" : "border-border"
                }`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragRoomId(room.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragRoomId(room.id);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragRoomId((id) => (id === room.id ? null : id));
                  }
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragRoomId(null);
                  if (busy) return;
                  const dt = e.dataTransfer.files;
                  if (dt?.length) await handleFilesForRoom(room, dt);
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-text-primary truncate" title={room.name}>
                      📋 {room.name}
                    </div>
                    <div className="text-[10px] text-text-tertiary mt-0.5 truncate" title={room.companies?.join(", ")}>
                      ID {room.id}
                      {room.companies?.length ? ` · ${room.companies.join(", ")}` : ""}
                    </div>
                  </div>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-bg text-text-secondary border border-border-md shrink-0 whitespace-nowrap">
                    표{activeSlot} {count}/{MAX_PER_SLOT}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5 flex-1 content-start min-h-[48px]">
                  {images.map((src, idx) => (
                    <div
                      key={`${room.id}-${activeSlot}-${idx}-${src.slice(0, 48)}`}
                      className="relative w-full aspect-square rounded-md border border-border-md overflow-hidden bg-bg min-w-0 group"
                    >
                      {isRemoteImageSource(src) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-1 text-center text-[9px] text-text-tertiary leading-tight">
                          앱 로컬 경로
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeImageAt(room, idx)}
                        className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-[#0f172a] text-white flex items-center justify-center opacity-90 hover:opacity-100 disabled:opacity-40 cursor-pointer"
                        title="이 항목 제거"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  {count < MAX_PER_SLOT && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openFilePicker(room.id)}
                      className="w-full aspect-square rounded-md border-2 border-dashed border-border-md flex flex-col items-center justify-center gap-0.5 text-text-tertiary hover:border-accent hover:text-accent hover:bg-accent-light/20 transition-colors disabled:opacity-50 cursor-pointer min-w-0 p-0.5"
                    >
                      {busy ? (
                        <Loader2 size={16} className="animate-spin text-accent" />
                      ) : (
                        <>
                          <ImagePlus size={18} className="opacity-70" />
                          <span className="text-[9px] font-semibold leading-none">추가</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <p className="text-[9px] text-text-tertiary mt-2 leading-snug">
                  드래그 앤 드롭 → 배차표{activeSlot}
                </p>
              </div>
            );
          })}

          {dispatchRooms.length === 0 && (
            <div className="col-span-5 text-center py-14 text-sm text-text-secondary border border-border rounded-[10px] bg-surface">
              조건에 맞는 채팅방이 없습니다. (998·999 제외, 채팅방 관리에서 먼저 방을 만드세요.)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

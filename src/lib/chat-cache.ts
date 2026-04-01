/**
 * 채팅 메시지·이미지 로컬 캐시 (IndexedDB)
 * — 방 재입장 시 Firestore/Storage 재다운로드 부담 완화
 */

import type { ChatMessage } from "@/lib/types";

const DB_NAME = "crewtalk-admin-chat";
const DB_VERSION = 1;
const STORE_ROOMS = "rooms";
const STORE_IMAGES = "images";

/** 방당 저장·메모리 상한 (오래된 메시지는 잘림) */
export const MAX_CACHED_MESSAGES_PER_ROOM = 2000;
/** 최신 N건은 `latest` 슬라이스로 유지 (Firestore 구독 윈도우와 동일) */
export const CHAT_WINDOW_SIZE = 50;

function canUseIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ROOMS)) db.createObjectStore(STORE_ROOMS);
      if (!db.objectStoreNames.contains(STORE_IMAGES)) db.createObjectStore(STORE_IMAGES);
    };
  });
}

function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  if (!canUseIdb()) return Promise.resolve(undefined);
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbPut(storeName: string, key: string, value: unknown): Promise<void> {
  if (!canUseIdb()) return Promise.resolve();
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(storeName).put(value, key);
      })
  );
}

function roomKey(roomId: string): string {
  return `room:${roomId}`;
}

function imageKey(roomId: string, messageId: string): string {
  return `${roomId}::${messageId}`;
}

export function messageCreatedMs(m: ChatMessage): number {
  if (m.createdAt instanceof Date && !Number.isNaN(m.createdAt.getTime())) {
    return m.createdAt.getTime();
  }
  return 0;
}

/** id 기준 병합, 동일 id는 createdAt이 더 최근인 쪽 유지 */
export function mergeMessagesById(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of a) map.set(m.id, m);
  for (const m of b) {
    const ex = map.get(m.id);
    if (!ex) map.set(m.id, m);
    else if (messageCreatedMs(m) >= messageCreatedMs(ex)) map.set(m.id, m);
  }
  return Array.from(map.values());
}

export function sortMessagesByCreatedAtAsc(msgs: ChatMessage[]): ChatMessage[] {
  return [...msgs].sort((x, y) => messageCreatedMs(x) - messageCreatedMs(y));
}

/** 최신 maxCount건만 유지 (오래된 것 제거) */
export function trimToMaxMessages(sortedAsc: ChatMessage[], maxCount: number): ChatMessage[] {
  if (sortedAsc.length <= maxCount) return sortedAsc;
  return sortedAsc.slice(sortedAsc.length - maxCount);
}

export function splitOlderAndLatest(
  sortedAsc: ChatMessage[],
  windowSize: number
): { older: ChatMessage[]; latest: ChatMessage[] } {
  if (sortedAsc.length <= windowSize) {
    return { older: [], latest: sortedAsc };
  }
  return {
    older: sortedAsc.slice(0, sortedAsc.length - windowSize),
    latest: sortedAsc.slice(-windowSize),
  };
}

/** 병합 배열 → 저장 상한 적용 후 older / latest 로 분할 */
export function mergedToSlices(merged: ChatMessage[]): { older: ChatMessage[]; latest: ChatMessage[] } {
  const sorted = sortMessagesByCreatedAtAsc(merged);
  const trimmed = trimToMaxMessages(sorted, MAX_CACHED_MESSAGES_PER_ROOM);
  return splitOlderAndLatest(trimmed, CHAT_WINDOW_SIZE);
}

export async function getCachedMessagesForRoom(roomId: string): Promise<ChatMessage[] | null> {
  try {
    const row = await idbGet<{ messages: ChatMessage[]; v?: number }>(STORE_ROOMS, roomKey(roomId));
    if (!row?.messages?.length) return null;
    return row.messages.map((m) => ({
      ...m,
      createdAt:
        m.createdAt != null
          ? m.createdAt instanceof Date
            ? m.createdAt
            : new Date(m.createdAt as string | number)
          : undefined,
    }));
  } catch {
    return null;
  }
}

export async function saveCachedMessagesForRoom(roomId: string, messages: ChatMessage[]): Promise<void> {
  try {
    const sorted = sortMessagesByCreatedAtAsc(messages);
    const trimmed = trimToMaxMessages(sorted, MAX_CACHED_MESSAGES_PER_ROOM);
    await idbPut(STORE_ROOMS, roomKey(roomId), { messages: trimmed, v: 1 });
  } catch (e) {
    console.warn("chat-cache: save messages failed", e);
  }
}

export async function getCachedImage(roomId: string, messageId: string): Promise<Blob | undefined> {
  try {
    const blob = await idbGet<Blob>(STORE_IMAGES, imageKey(roomId, messageId));
    return blob && blob.size > 0 ? blob : undefined;
  } catch {
    return undefined;
  }
}

export async function saveCachedImage(roomId: string, messageId: string, blob: Blob): Promise<void> {
  try {
    if (!blob || blob.size === 0) return;
    await idbPut(STORE_IMAGES, imageKey(roomId, messageId), blob);
  } catch (e) {
    console.warn("chat-cache: save image failed", e);
  }
}

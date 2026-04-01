import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from './config';
import type {
  Driver,
  Room,
  Company,
  ChatMessage,
  ReportMessage,
  EnrichedReportMessage,
  EmergencyMessage,
  Track,
  TrackPoint,
  WorkspaceCalendarItem,
  UserDirectoryRow,
  User,
  VehicleRegistryItem,
} from '@/lib/types';
import { isMaintenanceLikeType, messageBodyForDisplay } from '@/lib/chat-message-body';

export function parseUserRoleFromDoc(data: Record<string, unknown>): User['role'] {
  if (data.role === undefined || data.role === null || data.role === '') {
    if (data.isAdmin === true) return 'superAdmin';
  }
  const raw = String(data.role ?? 'driver').toLowerCase();
  if (raw === 'superadmin') return 'superAdmin';
  if (raw === 'manager') return 'manager';
  return 'driver';
}

/** Firestore users 문서에서 전화번호 후보 필드 통합 (phone · phoneDigits · driverId 꼬리 등) */
export function coerceUserPhoneFromDoc(data: Record<string, unknown>): string {
  const asTrimmedString = (v: unknown): string => {
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
    return '';
  };
  let p = asTrimmedString(data.phone);
  if (p) return p;
  p = asTrimmedString(data.phoneDigits);
  if (p) return p;
  const altKeys = ['mobile', 'tel', 'phoneNumber', '휴대폰', '전화번호'] as const;
  for (const k of altKeys) {
    p = asTrimmedString(data[k]);
    if (p) return p;
  }
  const driverId = asTrimmedString(data.driverId);
  if (driverId.includes('|')) {
    const tail = driverId.split('|').pop() ?? '';
    if (/^\d{10,11}$/.test(tail)) return tail;
  }
  return '';
}

// ===== Users (회원 프로필, users/{uid}) =====

/**
 * Firestore users 컬렉션 전체 조회 (관리자 콘솔 목록용)
 */
export async function getUsersDirectory(): Promise<UserDirectoryRow[]> {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    const rows: UserDirectoryRow[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const uid = docSnap.id;
      const email = typeof data.email === 'string' ? data.email.trim() : '';
      const loginEmail = typeof data.loginEmail === 'string' ? data.loginEmail.trim() : '';
      const loginId = typeof data.loginId === 'string' ? data.loginId.trim() : '';
      const driverId = typeof data.driverId === 'string' ? data.driverId.trim() : '';
      const displayId = email || loginEmail || loginId || driverId || uid;
      const companyRaw = data.company;
      const company =
        typeof companyRaw === 'string'
          ? companyRaw.trim()
          : companyRaw != null
            ? String(companyRaw).trim()
            : '';
      const noteRaw = data.note ?? data.specialNote ?? data.비고;
      const noteStr =
        typeof noteRaw === 'string'
          ? noteRaw.trim()
          : noteRaw != null
            ? String(noteRaw).trim()
            : '';
      return {
        uid,
        name: typeof data.name === 'string' ? data.name : '',
        phone: coerceUserPhoneFromDoc(data),
        company,
        driverId,
        role: parseUserRoleFromDoc(data),
        displayId,
        car: typeof data.car === 'string' ? data.car.trim() || undefined : undefined,
        note: noteStr || undefined,
      };
    });
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  } catch (error) {
    console.error('Error getting users directory:', error);
    return [];
  }
}

/**
 * 관리자가 users/{uid} 프로필 수정
 */
export async function updateUserByAdmin(
  uid: string,
  payload: {
    name: string;
    phone: string;
    company: string;
    role: 'driver' | 'manager' | 'superAdmin';
    car?: string;
    driverId?: string;
    note?: string;
  }
) {
  const phoneTrim = payload.phone.trim();
  const phoneDigits = phoneTrim.replace(/\D/g, '');
  const row: Record<string, unknown> = {
    name: payload.name.trim(),
    phone: phoneTrim,
    company: payload.company.trim(),
    role: payload.role,
    updatedAt: serverTimestamp(),
  };
  if (phoneDigits.length >= 10) row.phoneDigits = phoneDigits;
  if (payload.car !== undefined) row.car = payload.car.trim() || '';
  if (payload.driverId !== undefined) row.driverId = payload.driverId.trim();
  if (payload.note !== undefined) row.note = payload.note.trim();
  await updateDoc(doc(db, 'users', uid), row);
}

/**
 * users/{uid} 문서 삭제 (Firebase Auth 계정은 별도 처리 필요)
 */
export async function deleteUserDocument(uid: string) {
  await deleteDoc(doc(db, 'users', uid));
}

// ===== Drivers (기사) =====

/**
 * 전체 기사 목록 조회
 */
export async function getDrivers(): Promise<Driver[]> {
  try {
    const snapshot = await getDocs(collection(db, 'drivers'));
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        phone: data.phone || '',
        company: data.company || '',
        role: data.role || 'driver',
        car: data.car,
        note: data.note,
        specialNote: data.specialNote,
        loginEmail: data.loginEmail || undefined,
        authUid: data.authUid || undefined,
        loginPassword: data.loginPassword || undefined,
        createdAt: data.createdAt?.toDate(),
      } as Driver;
    });
  } catch (error) {
    console.error('Error getting drivers:', error);
    return [];
  }
}

/**
 * 특정 기사 정보 조회
 */
export async function getDriver(driverId: string): Promise<Driver | null> {
  try {
    const driverDoc = await getDoc(doc(db, 'drivers', driverId));
    if (!driverDoc.exists()) return null;
    
    const data = driverDoc.data();
    return {
      id: driverDoc.id,
      ...data,
      loginEmail: data.loginEmail || undefined,
      authUid: data.authUid || undefined,
      loginPassword: data.loginPassword || undefined,
      createdAt: data.createdAt?.toDate(),
    } as Driver;
  } catch (error) {
    console.error('Error getting driver:', error);
    return null;
  }
}

/**
 * 기사 역할 변경
 */
export async function updateDriverRole(driverId: string, role: 'driver' | 'manager' | 'superAdmin') {
  try {
    await updateDoc(doc(db, 'drivers', driverId), { role });
  } catch (error) {
    console.error('Error updating driver role:', error);
    throw error;
  }
}

/**
 * 기사 신규 등록 (관리자 웹)
 */
export async function createDriver(payload: {
  name: string;
  phone: string;
  company: string;
  role?: 'driver' | 'manager' | 'superAdmin';
  car?: string;
  note?: string;
}) {
  const row: Record<string, unknown> = {
    name: payload.name.trim(),
    phone: payload.phone.trim(),
    company: payload.company.trim(),
    role: payload.role ?? 'driver',
    createdAt: serverTimestamp(),
  };
  if (payload.car?.trim()) row.car = payload.car.trim();
  if (payload.note?.trim()) row.note = payload.note.trim();
  await addDoc(collection(db, 'drivers'), row);
}

/**
 * 기사 정보 수정
 */
export async function updateDriver(
  driverId: string,
  payload: {
    name: string;
    phone: string;
    company: string;
    role?: 'driver' | 'manager' | 'superAdmin';
    car?: string;
    note?: string;
  }
) {
  const ref = doc(db, 'drivers', driverId);
  await updateDoc(ref, {
    name: payload.name.trim(),
    phone: payload.phone.trim(),
    company: payload.company.trim(),
    role: payload.role ?? 'driver',
    car: payload.car?.trim() ?? '',
    note: payload.note?.trim() ?? '',
  });
}

/**
 * 기사 삭제
 */
export async function deleteDriver(driverId: string) {
  await deleteDoc(doc(db, 'drivers', driverId));
}

/**
 * 소속명 변경 시 해당 소속 기사들의 company 필드 일괄 업데이트
 */
export async function updateDriversCompany(oldName: string, newName: string) {
  try {
    const q = query(collection(db, 'drivers'), where('company', '==', oldName));
    const snapshot = await getDocs(q);
    const updates = snapshot.docs.map((d) =>
      updateDoc(doc(db, 'drivers', d.id), { company: newName })
    );
    await Promise.all(updates);
  } catch (error) {
    console.error('Error updating drivers company:', error);
    throw error;
  }
}

/**
 * 소속명 변경 시 Firestore users 컬렉션에서 해당 소속 회원의 company 일괄 업데이트
 */
export async function updateUsersCompany(oldName: string, newName: string) {
  try {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();
    if (!trimmedOld || trimmedOld === trimmedNew) return;
    const q = query(collection(db, 'users'), where('company', '==', trimmedOld));
    const snapshot = await getDocs(q);
    const updates = snapshot.docs.map((d) =>
      updateDoc(doc(db, 'users', d.id), {
        company: trimmedNew,
        updatedAt: serverTimestamp(),
      })
    );
    await Promise.all(updates);
  } catch (error) {
    console.error('Error updating users company:', error);
    throw error;
  }
}

/** 앱·웹 호환: Firestore에 여러 키로 저장된 이미지 URL을 하나로 */
function pickHttpImageUrl(data: Record<string, unknown>): string | undefined {
  const keys = ['imageUrl', 'imageURL', 'photoUrl', 'downloadUrl', 'fileUrl', 'url'] as const;
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string') {
      const t = v.trim();
      if (/^https?:\/\//i.test(t)) return t;
    }
  }
  return undefined;
}

/** 목록용 마지막 메시지 텍스트 포맷 (rooms.lastMessage · 메시지 문서 공통) */
function formatLastMessageForList(data: Record<string, unknown>): string {
  const type = data.type as string;
  if (type === 'notice') return `공지: ${(data.text as string) || ''}`.trim();
  if (type === 'report' && data.reportData) {
    const rd = data.reportData as Record<string, unknown>;
    const t = rd.type === '출근' ? '🌅 출근' : rd.type === '퇴근' ? '🌙 퇴근' : '';
    const c = rd.count != null ? `${rd.count}명` : '';
    return [t, c].filter(Boolean).join(' ') || '인원보고';
  }
  if (type === 'emergency') return `🚨 ${(data.emergencyType as string) || '긴급호출'}`;
  if (type === 'image' || type === 'photo' || type === 'picture' || pickHttpImageUrl(data))
    return '📷 사진';
  if (isMaintenanceLikeType(type)) {
    const body = messageBodyForDisplay(data);
    return body ? `🔧 ${body}` : '🔧 정비·예약';
  }
  const structured = messageBodyForDisplay(data);
  if (structured) return structured.length > 180 ? `${structured.slice(0, 177)}…` : structured;
  return (data.text as string) || '';
}

// ===== Rooms (채팅방) — 최상위 `rooms/{roomId}` 문서 + `rooms/{roomId}/messages` 서브컬렉션 =====

function firestoreStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter((s) => s.length > 0);
}

function coerceFirestoreStringArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter((s) => s.length > 0);
  if (typeof v === 'object') {
    return Object.values(v as Record<string, unknown>)
      .map((x) => String(x).trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

function lp2(n: number): string {
  return String(n).padStart(2, '0');
}

/** rooms 문서의 lastMessage 맵 → 목록용 미리보기 (Cloud Function이 갱신하는 필드) */
function previewFromLastMessage(lm: Record<string, unknown>): {
  lastMsg: string;
  time: string | null;
  date: string | null;
} {
  const createdRaw = lm.createdAt as { toDate?: () => Date } | undefined;
  const d = createdRaw?.toDate?.();
  let timeStr: string | null = null;
  let dateStr: string | null = null;
  if (d && !Number.isNaN(d.getTime())) {
    timeStr = `${lp2(d.getHours())}:${lp2(d.getMinutes())}`;
    dateStr = `${d.getFullYear()}-${lp2(d.getMonth() + 1)}-${lp2(d.getDate())}`;
  }
  const msgLike = { ...lm, time: timeStr ?? (lm.time as string | undefined), date: dateStr ?? (lm.date as string | undefined) };
  let lastMsg = formatLastMessageForList(msgLike).trim();
  if (!lastMsg) {
    const sender = typeof lm.senderName === 'string' ? lm.senderName.trim() : '';
    const text = typeof lm.text === 'string' ? lm.text.trim() : '';
    lastMsg = text || sender || '메시지';
  }
  return { lastMsg, time: timeStr, date: dateStr };
}

/** Firestore rooms/{docId} 단일 문서 → Room */
function mapFirestoreRoomData(docId: string, raw: Record<string, unknown>): Room {
  const idFromField =
    typeof raw.id === 'number'
      ? raw.id
      : typeof raw.id === 'string'
        ? Number.parseInt(raw.id, 10)
        : Number.NaN;
  const idNum = Number.isFinite(idFromField) ? idFromField : Number.parseInt(docId, 10) || 0;

  const nameRaw = raw.name ?? raw.roomName;
  const name =
    typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : `방 ${idNum}`;

  const sub = raw.subRoutes ?? raw.subroutes ?? raw['subRoutes'] ?? raw['세부노선목록'] ?? raw['세부노선'];
  const subRoutes = Array.isArray(sub)
    ? sub.map((x) => String(x).trim()).filter(Boolean)
    : coerceFirestoreStringArray(sub);

  const usesSplit =
    Object.prototype.hasOwnProperty.call(raw, 'timetable1Images') ||
    Object.prototype.hasOwnProperty.call(raw, 'timetable2Images');

  let lastMsg: string | undefined;
  let time: string | undefined;
  const lm = raw.lastMessage;
  if (lm && typeof lm === 'object' && !Array.isArray(lm)) {
    const p = previewFromLastMessage(lm as Record<string, unknown>);
    if (p.lastMsg) lastMsg = p.lastMsg;
    if (p.time) time = p.time;
  }

  const base: Room = {
    id: idNum,
    name,
    companies: coerceFirestoreStringArray(raw.companies),
    subRoutes,
    reportMode: raw.reportMode === 'summary' ? 'summary' : 'normal',
    adminOnly: typeof raw.adminOnly === 'boolean' ? raw.adminOnly : undefined,
    pinned: typeof raw.pinned === 'boolean' ? raw.pinned : undefined,
    lastMsg,
    time,
    navLinks: Array.isArray(raw.navLinks) ? (raw.navLinks as Room['navLinks']) : undefined,
  };

  if (usesSplit) {
    base.timetableUsesSplitFields = true;
    base.timetable1Images = firestoreStringList(raw['timetable1Images']);
    base.timetable2Images = firestoreStringList(raw['timetable2Images']);
  } else if (raw.timetableImages) {
    base.timetableImages = firestoreStringList(raw.timetableImages);
  }

  return base;
}

/** rooms 문서 저장 전 — 클라이언트 전용 필드 제거 · 분리 모드면 레거시 timetableImages 제거 */
function sanitizeRoomForConfig(r: Room): Room {
  const split = r.timetableUsesSplitFields === true;
  const { timetableUsesSplitFields: _t, ...rest } = r;
  if (!split) return rest as Room;
  const { timetableImages: _legacy, ...withoutLegacy } = rest as Room;
  return withoutLegacy as Room;
}

function roomPayloadForFirestore(r: Room): Record<string, unknown> {
  const s = sanitizeRoomForConfig(r);
  const split = r.timetableUsesSplitFields === true;
  const out: Record<string, unknown> = {
    id: s.id,
    name: s.name,
    companies: s.companies ?? [],
    subRoutes: s.subRoutes ?? [],
    reportMode: s.reportMode ?? 'normal',
  };
  if (s.adminOnly !== undefined) out.adminOnly = s.adminOnly;
  if (s.pinned !== undefined) out.pinned = s.pinned;
  if (s.navLinks !== undefined && s.navLinks.length > 0) out.navLinks = s.navLinks;
  if (split) {
    out.timetable1Images = s.timetable1Images ?? [];
    out.timetable2Images = s.timetable2Images ?? [];
  } else if (s.timetableImages && s.timetableImages.length > 0) {
    out.timetableImages = s.timetableImages;
  }
  return out;
}

/**
 * 채팅방 목록 조회 (최상위 rooms 컬렉션)
 */
export async function getRooms(): Promise<Room[]> {
  try {
    const snapshot = await getDocs(collection(db, 'rooms'));
    const rooms = snapshot.docs.map((d) =>
      mapFirestoreRoomData(d.id, d.data() as Record<string, unknown>)
    );
    rooms.sort((a, b) => a.id - b.id);
    return rooms;
  } catch (error) {
    console.error('Error getting rooms:', error);
    return [];
  }
}

/** 최상위 필드만 — serverTimestamp() 등 특수 값은 재귀하지 않음 */
function shallowOmitUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Firestore는 undefined를 허용하지 않음 — 중첩 객체에서 제거 */
function stripUndefined<T>(val: T): T {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map((v) => stripUndefined(v)) as T;
  const result = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(val as object)) {
    if (v !== undefined) result[k] = stripUndefined(v);
  }
  return result as T;
}

/**
 * 채팅방 메타 일괄 저장 (rooms/{id} merge). 목록에서 빠진 문서는 삭제(서브컬렉션 messages 는 자동 삭제 안 됨).
 */
export async function updateRooms(rooms: Room[]) {
  try {
    const cleaned = rooms.map(sanitizeRoomForConfig);
    const snapshot = await getDocs(collection(db, 'rooms'));
    const nextIds = new Set(cleaned.map((r) => String(r.id)));
    for (const d of snapshot.docs) {
      if (!nextIds.has(d.id)) {
        await deleteDoc(doc(db, 'rooms', d.id));
      }
    }
    for (const r of cleaned) {
      const idStr = String(r.id);
      const ref = doc(db, 'rooms', idStr);
      const existing = await getDoc(ref);
      const base = stripUndefined(roomPayloadForFirestore(r) as Record<string, unknown>);
      await setDoc(
        ref,
        {
          ...base,
          updatedAt: serverTimestamp(),
          ...(!existing.exists() ? { createdAt: serverTimestamp() } : {}),
        },
        { merge: true }
      );
    }
  } catch (error) {
    console.error('Error updating rooms:', error);
    throw error;
  }
}

function applyTimetableSlotPatch(room: Room, slot: 1 | 2, urls: string[]): Room {
  const usesSplit = room.timetableUsesSplitFields === true;

  if (usesSplit) {
    if (slot === 1) return { ...room, timetable1Images: urls };
    return { ...room, timetable2Images: urls };
  }

  if (slot === 1) {
    const { timetableImages: _legacy, ...rest } = room;
    return {
      ...rest,
      timetable1Images: urls,
      timetable2Images: [],
      timetableUsesSplitFields: true,
    };
  }

  const legacySlot1 = room.timetableImages ?? [];
  const { timetableImages: _legacy, ...rest } = room;
  return {
    ...rest,
    timetable1Images: legacySlot1,
    timetable2Images: urls,
    timetableUsesSplitFields: true,
  };
}

/**
 * 한 채팅방의 배차표1 또는 배차표2 URL 목록만 갱신
 */
export async function patchRoomTimetableSlot(roomId: number, slot: 1 | 2, urls: string[]) {
  const ref = doc(db, 'rooms', String(roomId));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('채팅방을 찾을 수 없습니다.');
  }
  const room = mapFirestoreRoomData(snap.id, snap.data() as Record<string, unknown>);
  const next = applyTimetableSlotPatch(room, slot, urls);
  const base = stripUndefined(roomPayloadForFirestore(next) as Record<string, unknown>);
  await setDoc(ref, { ...base, updatedAt: serverTimestamp() }, { merge: true });
}

// ===== Companies (소속/업체) =====

/**
 * 업체 목록 조회
 */
export async function getCompanies(): Promise<Company[]> {
  try {
    const companiesDoc = await getDoc(doc(db, 'config', 'companies'));
    if (!companiesDoc.exists()) return [];
    return (companiesDoc.data().items || []) as Company[];
  } catch (error) {
    console.error('Error getting companies:', error);
    return [];
  }
}

/**
 * 업체 목록 업데이트
 */
export async function updateCompanies(companies: Company[]) {
  try {
    await setDoc(doc(db, 'config', 'companies'), { items: stripUndefined(companies) }, { merge: true });
  } catch (error) {
    console.error('Error updating companies:', error);
    throw error;
  }
}

// ===== Vehicle registry (차량 관리 — users 와 분리) =====

const VEHICLE_REGISTRY_DOC = doc(db, 'config', 'vehicle_registry');

function parseVehicleRegistryItems(raw: unknown): VehicleRegistryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: VehicleRegistryItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : '';
    if (!id) continue;
    const company = typeof o.company === 'string' ? o.company.trim() : '';
    const carNumber = typeof o.carNumber === 'string' ? o.carNumber.trim() : '';
    const driverName = typeof o.driverName === 'string' ? o.driverName.trim() : '';
    const phone = typeof o.phone === 'string' ? o.phone.trim() : '';
    const noteRaw = o.note;
    const note =
      typeof noteRaw === 'string'
        ? noteRaw.trim()
        : noteRaw != null
          ? String(noteRaw).trim()
          : '';
    const orderRaw = o.orderInCompany;
    const orderInCompany =
      typeof orderRaw === 'number' && Number.isFinite(orderRaw) ? Math.floor(orderRaw) : undefined;
    out.push({
      id,
      company,
      carNumber,
      driverName,
      phone,
      ...(note ? { note } : {}),
      ...(orderInCompany !== undefined ? { orderInCompany } : {}),
    });
  }
  return out;
}

/**
 * 차량 관리 목록 (config/vehicle_registry.items)
 */
export async function getVehicleRegistry(): Promise<VehicleRegistryItem[]> {
  try {
    const snap = await getDoc(VEHICLE_REGISTRY_DOC);
    if (!snap.exists()) return [];
    return parseVehicleRegistryItems(snap.data().items);
  } catch (error) {
    console.error('Error getting vehicle registry:', error);
    return [];
  }
}

/**
 * 차량 관리 목록 일괄 저장 (관리자 콘솔 — isElevatedAdmin)
 */
export async function updateVehicleRegistryItems(items: VehicleRegistryItem[]) {
  await setDoc(
    VEHICLE_REGISTRY_DOC,
    { items: stripUndefined(items), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ===== Workspace calendar (팀 공유 일정·할일) =====

const WORKSPACE_CALENDAR_DOC = doc(db, 'config', 'workspace_calendar');

/**
 * 팀 업무 달력 실시간 구독 (팀원 간 동기화)
 */
export function subscribeWorkspaceCalendar(
  onItems: (items: WorkspaceCalendarItem[]) => void,
  onError?: (e: Error) => void
): () => void {
  return onSnapshot(
    WORKSPACE_CALENDAR_DOC,
    (snap) => {
      const items = (snap.exists() ? snap.data().items : []) as WorkspaceCalendarItem[];
      onItems(Array.isArray(items) ? items : []);
    },
    (err) => {
      console.error('workspace_calendar snapshot error:', err);
      onError?.(err as Error);
    }
  );
}

/**
 * 팀 업무 달력 일괄 저장 (관리자만 규칙상 쓰기 가능)
 */
export async function updateWorkspaceCalendarItems(items: WorkspaceCalendarItem[]) {
  await setDoc(
    WORKSPACE_CALENDAR_DOC,
    { items: stripUndefined(items), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ===== Messages (채팅 메시지) =====

const MESSAGES_PAGE_SIZE = 50;

function mapDocToChatMessage(docId: string, data: Record<string, unknown>): ChatMessage {
  const picked = pickHttpImageUrl(data);
  const createdRaw = data.createdAt as { toDate?: () => Date } | undefined;
  return {
    id: docId,
    ...data,
    ...(picked ? { imageUrl: picked } : {}),
    createdAt: createdRaw?.toDate?.() ?? data.createdAt,
  } as ChatMessage;
}

/**
 * 채팅방 메시지 조회 - 최신 N건
 */
export async function getMessages(roomId: string, limitCount: number = MESSAGES_PAGE_SIZE): Promise<ChatMessage[]> {
  try {
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map((doc) => mapDocToChatMessage(doc.id, doc.data() as Record<string, unknown>)).reverse(); // 오래된순→최신순
  } catch (error) {
    console.error('Error getting messages:', error);
    return [];
  }
}

/**
 * 채팅방 이전 메시지 조회 (스크롤 업 시)
 */
export async function getOlderMessages(
  roomId: string,
  beforeCreatedAt: Date,
  limitCount: number = MESSAGES_PAGE_SIZE
): Promise<ChatMessage[]> {
  try {
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const beforeTimestamp = Timestamp.fromDate(beforeCreatedAt);
    const q = query(
      messagesRef,
      orderBy('createdAt', 'desc'),
      startAfter(beforeTimestamp),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((doc) => mapDocToChatMessage(doc.id, doc.data() as Record<string, unknown>))
      .reverse(); // 오래된순→최신순 (prepend 시 순서 맞음)
  } catch (error) {
    console.error('Error getting older messages:', error);
    return [];
  }
}

/**
 * 채팅방 메시지 실시간 구독 (최신 N건만)
 */
export function subscribeToMessages(
  roomId: string,
  callback: (messages: ChatMessage[]) => void
) {
  const messagesRef = collection(db, 'rooms', roomId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(MESSAGES_PAGE_SIZE));
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs
      .map((doc) => mapDocToChatMessage(doc.id, doc.data() as Record<string, unknown>))
      .reverse(); // 오래된순→최신순
    callback(messages);
  }, (error) => {
    console.error('Error subscribing to messages:', error);
    callback([]);
  });
}

/**
 * 채팅방별 최신 미리보기 실시간 구독 (목록용)
 * - rooms/{id}.lastMessage 가 있으면 문서 스냅샷으로 반영(Cloud Function 갱신)
 * - 없으면 messages 서브컬렉션 최신 1건으로 폴백
 */
export function subscribeToRoomLastMessage(
  roomId: string,
  callback: (lastMsg: string | null, time: string | null, date: string | null) => void
): () => void {
  const roomRef = doc(db, 'rooms', roomId);
  let messagesUnsub: (() => void) | null = null;
  const clearMsgListener = () => {
    if (messagesUnsub) {
      messagesUnsub();
      messagesUnsub = null;
    }
  };

  const unsubRoom = onSnapshot(
    roomRef,
    (snap) => {
      clearMsgListener();
      if (!snap.exists()) {
        callback(null, null, null);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const lm = data.lastMessage;
      if (lm && typeof lm === 'object' && !Array.isArray(lm)) {
        const p = previewFromLastMessage(lm as Record<string, unknown>);
        callback(p.lastMsg || null, p.time, p.date);
        return;
      }
      const messagesRef = collection(db, 'rooms', roomId, 'messages');
      const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(1));
      messagesUnsub = onSnapshot(
        q,
        (mSnap) => {
          if (mSnap.empty) {
            callback(null, null, null);
            return;
          }
          const md = mSnap.docs[0].data();
          callback(
            formatLastMessageForList(md as Record<string, unknown>),
            (md.time as string) ?? null,
            (md.date as string) ?? null
          );
        },
        (err) => {
          console.error('Error subscribing to room last message (messages):', err);
          callback(null, null, null);
        }
      );
    },
    (error) => {
      console.error('Error subscribing to room last message:', error);
      clearMsgListener();
      callback(null, null, null);
    }
  );

  return () => {
    clearMsgListener();
    unsubRoom();
  };
}

/**
 * 메시지 전송
 * - 모바일 앱과 호환되려면 userId, isMe 필수 (아키텍처 문서 2.5)
 * - 관리자 웹: Firebase Auth UID를 userId 로 사용(규칙상 메시지 수정·삭제 시 본인 식별)
 */
export async function sendMessage(roomId: string, message: Partial<ChatMessage>) {
  try {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const payload = shallowOmitUndefined({
      ...(message as Record<string, unknown>),
      userId: message.userId ?? auth.currentUser?.uid ?? 'admin',
      isMe: message.isMe ?? false,
      time,
      date,
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'rooms', roomId, 'messages'), payload);
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

/**
 * 메시지 삭제
 */
export async function deleteMessage(roomId: string, messageId: string) {
  try {
    await deleteDoc(doc(db, 'rooms', roomId, 'messages', messageId));
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
}

// ===== Reports (인원보고) =====

/**
 * 인원보고 내역 조회
 */
export async function getReports(roomId?: string, date?: string): Promise<ReportMessage[]> {
  try {
    // roomId가 없으면 모든 방에서 조회 (실제로는 각 방별로 조회해야 함)
    if (!roomId) {
      // 모든 방의 메시지를 조회하는 것은 복잡하므로, 특정 방 ID를 받아야 함
      return [];
    }
    
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    let q = query(messagesRef, where('type', '==', 'report'));
    
    if (date) {
      q = query(q, where('date', '==', date));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      const subRouteRaw = data.subRoute ?? data.세부노선 ?? data.sub_route;
      const phoneRaw = data.phone ?? data.phoneDigits ?? data.mobile;
      return {
        id: doc.id,
        ...data,
        date: data.date || '',
        time: data.time || '',
        name: data.name || '',
        phone:
          typeof phoneRaw === 'string'
            ? phoneRaw.trim()
            : phoneRaw != null
              ? String(phoneRaw).trim()
              : undefined,
        route: data.route || '',
        subRoute: typeof subRouteRaw === 'string' ? subRouteRaw : subRouteRaw != null ? String(subRouteRaw) : undefined,
      } as ReportMessage;
    });
  } catch (error) {
    console.error('Error getting reports:', error);
    return [];
  }
}

/**
 * 모든 방에서 특정 날짜의 인원보고 조회
 */
export async function getAllReportsByDate(date: string, rooms: Room[]): Promise<ReportMessage[]> {
  try {
    const allReports: ReportMessage[] = [];
    
    // 각 방별로 조회
    for (const room of rooms) {
      if (room.id >= 998) continue; // 시스템 방 제외
      
      const reports = await getReports(room.id.toString(), date);
      allReports.push(...reports);
    }
    
    return allReports;
  } catch (error) {
    console.error('Error getting all reports:', error);
    return [];
  }
}

/**
 * 채팅방(노선)별로 특정 날짜 인원보고를 묶어서 반환
 */
export async function getReportsGroupedByRoomForDate(
  date: string,
  rooms: Room[]
): Promise<{ room: Room; reports: ReportMessage[] }[]> {
  const result: { room: Room; reports: ReportMessage[] }[] = [];
  for (const room of rooms) {
    if (room.id >= 998) continue;
    const reports = await getReports(room.id.toString(), date);
    result.push({ room, reports });
  }
  return result;
}

function mapDocToEnrichedReport(docId: string, data: Record<string, unknown>, roomId: string): EnrichedReportMessage | null {
  if (data.type !== 'report') return null;
  const createdRaw = data.createdAt as { toDate?: () => Date } | undefined;
  const createdAt = createdRaw?.toDate?.() ?? new Date(0);
  const rd = (data.reportData ?? {}) as EnrichedReportMessage['reportData'];
  if (!rd || typeof rd !== 'object') return null;
  return {
    id: docId,
    userId: (data.userId as string) || '',
    driverId: data.driverId as string | undefined,
    name: (data.name as string) || '',
    time: (data.time as string) || '',
    date: (data.date as string) || '',
    type: 'report',
    route: (data.route as string) || '',
    subRoute: data.subRoute as string | undefined,
    car: (data.car as string) || '',
    reportData: {
      type: (rd.type as '출근' | '퇴근' | '야간') || '출근',
      count: Number(rd.count) || 0,
      maxCount: Number(rd.maxCount) || 0,
      isOverCapacity: Boolean(rd.isOverCapacity),
    },
    roomId,
    createdAt,
  };
}

/**
 * 특정 운행일(`date` 필드) 인원보고만 조회 + roomId·createdAt 포함
 * — 이상 감지 시 구간 분할·간격 계산은 createdAt을 Asia/Seoul로 해석
 */
export async function getAllEnrichedReportsByDate(date: string, rooms: Room[]): Promise<EnrichedReportMessage[]> {
  try {
    const all: EnrichedReportMessage[] = [];
    for (const room of rooms) {
      if (room.id >= 998) continue;
      const roomId = room.id.toString();
      const messagesRef = collection(db, 'rooms', roomId, 'messages');
      const q = query(messagesRef, where('type', '==', 'report'), where('date', '==', date));
      const snapshot = await getDocs(q);
      for (const docSnap of snapshot.docs) {
        const row = mapDocToEnrichedReport(docSnap.id, docSnap.data() as Record<string, unknown>, roomId);
        if (row) all.push(row);
      }
    }
    return all;
  } catch (error) {
    console.error('Error getting enriched reports:', error);
    return [];
  }
}

// ===== Emergency (긴급호출) =====

/**
 * 긴급호출 이력 조회
 */
export async function getEmergencies(roomId?: string, limitCount: number = 50): Promise<EmergencyMessage[]> {
  try {
    if (!roomId) return [];
    
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const q = query(
      messagesRef,
      where('type', '==', 'emergency'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: data.date || '',
        time: data.time || '',
        name: data.name || '',
        route: data.route || '',
        emergencyType: data.emergencyType || '',
        status: data.status || '처리중',
        adminComment: data.adminComment || '',
      } as EmergencyMessage;
    });
  } catch (error) {
    console.error('Error getting emergencies:', error);
    return [];
  }
}

/**
 * 모든 방에서 긴급호출 조회
 */
export async function getAllEmergencies(rooms: Room[], limitCount: number = 50): Promise<EmergencyMessage[]> {
  try {
    const allEmergencies: EmergencyMessage[] = [];
    
    for (const room of rooms) {
      if (room.id >= 998) continue; // 시스템 방 제외
      
      const emergencies = await getEmergencies(room.id.toString(), limitCount);
      allEmergencies.push(...emergencies.map((e) => ({ ...e, roomId: room.id.toString() })));
    }
    
    // 최신순 정렬
    return allEmergencies.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time}`).getTime();
      const dateB = new Date(`${b.date} ${b.time}`).getTime();
      return dateB - dateA;
    }).slice(0, limitCount);
  } catch (error) {
    console.error('Error getting all emergencies:', error);
    return [];
  }
}

/**
 * 긴급호출 처리 상태 변경
 */
export async function updateEmergencyStatus(
  roomId: string,
  messageId: string,
  status: '처리중' | '완료'
) {
  try {
    const msgRef = doc(db, 'rooms', String(roomId), 'messages', String(messageId));
    await updateDoc(msgRef, { status });
  } catch (error) {
    console.error('Error updating emergency status:', error);
    throw error;
  }
}

/**
 * 긴급호출 관리자 코멘트 변경
 */
export async function updateEmergencyComment(
  roomId: string,
  messageId: string,
  adminComment: string
) {
  try {
    const msgRef = doc(db, 'rooms', String(roomId), 'messages', String(messageId));
    await updateDoc(msgRef, { adminComment });
  } catch (error) {
    console.error('Error updating emergency comment:', error);
    throw error;
  }
}

// ===== Tracks (GPS 경로) =====

/** 로컬 타임존 캘린더 기준 YYYY-MM-DD — `toISOString()`(UTC) 날짜와 `getHours()`(로컬) 혼용 시 하루 어긋남 방지 */
function formatLocalDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Firestore 숫자·문자열·Long 등 → 정수 (실패 시 undefined) */
function coerceFirestoreNumberish(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? Math.round(n) : undefined;
  }
  if (typeof v === "object") {
    const o = v as { toNumber?: () => number };
    if (typeof o.toNumber === "function") {
      const n = o.toNumber();
      return Number.isFinite(n) ? Math.round(n) : undefined;
    }
  }
  return undefined;
}

/** tracks 문서에서 보고 인원 필드 후보를 순서대로 해석 (앱·레거시 키 혼용 대응) */
function coerceTrackReportCount(data: Record<string, unknown>): number {
  const reportData = data.reportData as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    data.reportCount,
    data.보고인원,
    data.headcount,
    data.headCount,
    data.passengerCount,
    data.passengers,
    data.탑승인원,
    data.count,
    data.인원,
    reportData?.count,
    reportData?.탑승인원,
  ];
  for (const c of candidates) {
    const n = coerceFirestoreNumberish(c);
    if (n !== undefined) return n;
  }
  return 0;
}

/**
 * tracks 목록 조회
 * - GPS 좌표는 `tracks/{id}/points` 서브컬렉션(또는 레거시 문서 내 points 배열) — getTrackPoints 참고
 * - reportCountZeroOnly: true → 인원 0인 트랙만. false → 인원과 무관 전체. 생략 시 true(관제 외 호출 호환).
 */
export async function getTracks(filters?: { date?: string; routeName?: string; reportCountZeroOnly?: boolean }): Promise<Track[]> {
  try {
    const snapshot = await getDocs(collection(db, 'tracks'));
    let tracks = snapshot.docs.map((d) => {
      const data = d.data();
      const reportCount = coerceTrackReportCount(data as Record<string, unknown>);
      const startedAt = data.startedAt?.toDate?.() ?? data.startedAt;
      const createdAt = data.createdAt?.toDate?.() ?? data.timestamp?.toDate?.() ?? startedAt ?? data.createdAt ?? data.timestamp;
      const startTimeRaw = data.startedAt?.toDate?.() ?? data.startedAt ?? data.startTime?.toDate?.() ?? data.startTime ?? data.time ?? data.departureTime ?? data.시작시간;
      let dateStr = data.date ?? data.운행일 ?? data.startDate;
      if (!dateStr && (startedAt || createdAt)) {
        const startOrCreated = (startedAt || createdAt) instanceof Date
          ? (startedAt || createdAt)
          : new Date(startedAt || createdAt);
        dateStr = formatLocalDateYmd(startOrCreated);
      }
      let startTimeVal = startTimeRaw;
      if (!startTimeVal && (startedAt || createdAt)) {
        const d = (startedAt || createdAt) instanceof Date ? (startedAt || createdAt) : new Date(startedAt || createdAt);
        startTimeVal = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      } else if (startTimeRaw instanceof Date) {
        startTimeVal = `${String(startTimeRaw.getHours()).padStart(2, "0")}:${String(startTimeRaw.getMinutes()).padStart(2, "0")}`;
      }
      return {
        id: d.id,
        routeName: data.route ?? data.routeName ?? data.courseName ?? data.노선 ?? data.name,
        subRoute: data.subRoute ?? data.세부노선,
        driverId: data.driverId ?? data.ownerUid,
        driverName:
          data.driverName ??
          data.name ??
          data.driver ??
          (typeof data.driver === "object" ? (data.driver as { name?: string })?.name : null) ??
          data.userName ??
          data.기사명,
        date: dateStr,
        startTime: startTimeVal,
        endTime: data.endedAt?.toDate?.() ?? data.endedAt ?? data.endTime?.toDate?.() ?? data.endTime,
        carNumber: data.car ?? data.carNumber ?? data.vehicleNumber ?? data.차량번호,
        reportCount,
        ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : undefined,
        roomId: data.roomId ?? data.room_id,
        isActive: typeof data.isActive === "boolean" ? data.isActive : undefined,
      } as Track;
    });
    const zeroOnly =
      filters == null || filters.reportCountZeroOnly == null
        ? true
        : filters.reportCountZeroOnly === true;
    if (zeroOnly) {
      tracks = tracks.filter((t) => (t.reportCount ?? 0) === 0);
    }
    if (filters?.date) tracks = tracks.filter((t) => t.date === filters.date);
    if (filters?.routeName) tracks = tracks.filter((t) => t.routeName === filters.routeName);
    tracks.sort((a, b) => ((b.date || '') > (a.date || '') ? 1 : -1));
    return tracks;
  } catch (error) {
    console.error('Error getting tracks:', error);
    return [];
  }
}

function coerceUnknownToMillis(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v < 1e11 ? Math.round(v * 1000) : Math.round(v);
  }
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof v === 'object') {
    const o = v as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof o.toMillis === 'function') {
      const t = o.toMillis();
      return Number.isFinite(t) ? t : 0;
    }
    if (typeof o.seconds === 'number' && Number.isFinite(o.seconds)) {
      const ns = typeof o.nanoseconds === 'number' ? o.nanoseconds : 0;
      return o.seconds * 1000 + Math.floor(ns / 1e6);
    }
  }
  return 0;
}

function extractTimestampMsFromRecord(p: Record<string, unknown>): number {
  const keys = ['ts', 'time', 't', 'createdAt', 'updatedAt', 'timestamp', 'sampledAt', 'recordedAt'];
  for (const k of keys) {
    const ms = coerceUnknownToMillis(p[k]);
    if (ms > 0) return ms;
  }
  return 0;
}

function extractLatLng(p: Record<string, unknown>): { lat: number; lng: number } | null {
  const tryPair = (la: unknown, ln: unknown): { lat: number; lng: number } | null => {
    const lat = typeof la === 'number' ? la : Number(la);
    const lng = typeof ln === 'number' ? ln : Number(ln);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
  };

  const top = tryPair(
    p.lat ?? p.latitude ?? p.Lat,
    p.lng ?? p.longitude ?? p.Lng
  );
  if (top) return top;

  const coord = p.coord as Record<string, unknown> | undefined;
  if (coord) {
    const c = tryPair(coord.lat ?? coord.latitude, coord.lng ?? coord.longitude);
    if (c) return c;
  }

  const geoKeys = ['location', 'geo', 'geoPoint', 'position', 'gps', 'coordinate'];
  for (const k of geoKeys) {
    const g = p[k];
    if (g && typeof g === 'object') {
      const o = g as Record<string, unknown>;
      const c = tryPair(
        o.latitude ?? o._latitude ?? o.lat,
        o.longitude ?? o._longitude ?? o.lng
      );
      if (c) return c;
    }
  }

  const coords = p.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
}

function sortPointRecordsByTime<T extends { id: string; data: () => Record<string, unknown> }>(
  docs: T[]
): T[] {
  return [...docs].sort((a, b) => {
    const ta = extractTimestampMsFromRecord(a.data());
    const tb = extractTimestampMsFromRecord(b.data());
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

/** 포인트 객체에서 lat/lng/부가정보 추출 (다양한 필드명 지원) */
function parsePoint(p: Record<string, unknown>): TrackPoint | null {
  const ll = extractLatLng(p);
  if (!ll) return null;
  const tsMs = extractTimestampMsFromRecord(p);
  const ts = tsMs > 0 ? tsMs : undefined;
  const speedRaw = Number(p.speed ?? p.velocity ?? 0);
  const headingRaw = Number(p.heading ?? p.bearing ?? 0);
  const accuracyRaw = Number(p.accuracy ?? p.acc ?? p.horizontalAccuracy ?? 0);
  return {
    lat: ll.lat,
    lng: ll.lng,
    ts,
    speed: isNaN(speedRaw) ? undefined : speedRaw,
    heading: isNaN(headingRaw) ? undefined : headingRaw,
    accuracy: isNaN(accuracyRaw) ? undefined : accuracyRaw,
  };
}

/** 포인트 객체에서 lat, lng, speed, heading, ts 추출 (엑셀 내보내기용) */
function parsePointForExport(p: Record<string, unknown>): { lat: number; lng: number; speed: number; heading: number; ts: number } | null {
  const base = parsePoint(p);
  if (!base) return null;
  const speed = Number(p.speed ?? p.velocity ?? 0);
  const heading = Number(p.heading ?? p.bearing ?? 0);
  const ts = extractTimestampMsFromRecord(p) || base.ts || 0;
  return { ...base, speed: isNaN(speed) ? 0 : speed, heading: isNaN(heading) ? 0 : heading, ts };
}

/**
 * 특정 track의 GPS 포인트 조회
 * - 문서 내 points 배열 우선, 없으면 points 서브컬렉션 조회
 * - lat/lng, latitude/longitude 등 다양한 필드명 지원
 */
export async function getTrackPoints(trackId: string): Promise<TrackPoint[]> {
  try {
    const trackDoc = await getDoc(doc(db, 'tracks', trackId));
    if (!trackDoc.exists()) return [];

    const data = trackDoc.data();
    const pointsFromArray = data?.points as Record<string, unknown>[] | undefined;

    if (pointsFromArray && Array.isArray(pointsFromArray) && pointsFromArray.length > 0) {
      const sorted = [...pointsFromArray].sort(
        (a, b) =>
          extractTimestampMsFromRecord(a as Record<string, unknown>) -
          extractTimestampMsFromRecord(b as Record<string, unknown>)
      );
      return sorted.map((p) => parsePoint(p as Record<string, unknown>)).filter((x): x is TrackPoint => x !== null);
    }

    const pointsRef = collection(db, 'tracks', trackId, 'points');
    const pointsSnap = await getDocs(pointsRef);
    const ordered = sortPointRecordsByTime(pointsSnap.docs);
    return ordered.map((d) => parsePoint(d.data())).filter((x): x is TrackPoint => x !== null);
  } catch (error) {
    console.error('Error getting track points:', error);
    return [];
  }
}

/**
 * 특정 track의 GPS 포인트 조회 (엑셀 내보내기용 - speed 포함)
 */
export async function getTrackPointsForExport(trackId: string): Promise<{ lat: number; lng: number; speed: number; heading: number; ts: number }[]> {
  try {
    const trackDoc = await getDoc(doc(db, 'tracks', trackId));
    if (!trackDoc.exists()) return [];

    const data = trackDoc.data();
    const pointsFromArray = data?.points as Record<string, unknown>[] | undefined;

    if (pointsFromArray && Array.isArray(pointsFromArray) && pointsFromArray.length > 0) {
      const sorted = [...pointsFromArray].sort(
        (a, b) =>
          extractTimestampMsFromRecord(a as Record<string, unknown>) -
          extractTimestampMsFromRecord(b as Record<string, unknown>)
      );
      return sorted
        .map((p) => parsePointForExport(p as Record<string, unknown>))
        .filter((x): x is { lat: number; lng: number; speed: number; heading: number; ts: number } => x !== null);
    }

    const pointsRef = collection(db, 'tracks', trackId, 'points');
    const pointsSnap = await getDocs(pointsRef);
    const orderedExp = sortPointRecordsByTime(pointsSnap.docs);
    return orderedExp
      .map((d) => parsePointForExport(d.data()))
      .filter((x): x is { lat: number; lng: number; speed: number; heading: number; ts: number } => x !== null);
  } catch (error) {
    console.error('Error getting track points for export:', error);
    return [];
  }
}

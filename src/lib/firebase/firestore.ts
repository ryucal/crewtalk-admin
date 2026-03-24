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
import { db } from './config';
import type { Driver, Room, Company, ChatMessage, ReportMessage, EnrichedReportMessage, EmergencyMessage, Track, TrackPoint } from '@/lib/types';

// ===== Drivers (기사) =====

/**
 * 전체 기사 목록 조회
 */
export async function getDrivers(): Promise<Driver[]> {
  try {
    const snapshot = await getDocs(collection(db, 'drivers'));
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name || '',
      phone: doc.data().phone || '',
      company: doc.data().company || '',
      role: doc.data().role || 'driver',
      createdAt: doc.data().createdAt?.toDate(),
    })) as Driver[];
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
    
    return {
      id: driverDoc.id,
      ...driverDoc.data(),
      createdAt: driverDoc.data().createdAt?.toDate(),
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

// ===== Rooms (채팅방) =====

/**
 * 채팅방 목록 조회
 */
export async function getRooms(): Promise<Room[]> {
  try {
    const roomsDoc = await getDoc(doc(db, 'config', 'rooms'));
    if (!roomsDoc.exists()) return [];
    return (roomsDoc.data().items || []) as Room[];
  } catch (error) {
    console.error('Error getting rooms:', error);
    return [];
  }
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
 * 채팅방 목록 업데이트
 */
export async function updateRooms(rooms: Room[]) {
  try {
    await setDoc(doc(db, 'config', 'rooms'), { items: stripUndefined(rooms) }, { merge: true });
  } catch (error) {
    console.error('Error updating rooms:', error);
    throw error;
  }
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

// ===== Messages (채팅 메시지) =====

const MESSAGES_PAGE_SIZE = 50;

/**
 * 채팅방 메시지 조회 - 최신 N건
 */
export async function getMessages(roomId: string, limitCount: number = MESSAGES_PAGE_SIZE): Promise<ChatMessage[]> {
  try {
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
      } as ChatMessage;
    }).reverse(); // 오래된순→최신순
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
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
      } as ChatMessage;
    }).reverse(); // 오래된순→최신순 (prepend 시 순서 맞음)
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
    const messages = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
      } as ChatMessage;
    }).reverse(); // 오래된순→최신순
    callback(messages);
  }, (error) => {
    console.error('Error subscribing to messages:', error);
    callback([]);
  });
}

/**
 * 채팅방별 최신 메시지 실시간 구독 (채팅방 목록용)
 * - 각 room의 마지막 1건만 구독하여 lastMsg, time, date 실시간 갱신
 */
export function subscribeToRoomLastMessage(
  roomId: string,
  callback: (lastMsg: string | null, time: string | null, date: string | null) => void
): () => void {
  const messagesRef = collection(db, 'rooms', roomId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(1));

  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      callback(null, null, null);
      return;
    }
    const data = snapshot.docs[0].data();
    const msg = formatLastMessageForList(data);
    const time = (data.time as string) ?? null;
    const date = (data.date as string) ?? null;
    callback(msg, time, date);
  }, (error) => {
    console.error('Error subscribing to room last message:', error);
    callback(null, null, null);
  });
}

/** 목록용 마지막 메시지 텍스트 포맷 */
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
  return (data.text as string) || '';
}

/**
 * 메시지 전송
 * - 모바일 앱과 호환되려면 userId, isMe 필수 (아키텍처 문서 2.5)
 * - 관리자 웹에서 보낼 때 userId: "admin", isMe: false 기본 적용
 */
export async function sendMessage(roomId: string, message: Partial<ChatMessage>) {
  try {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    await addDoc(collection(db, 'rooms', roomId, 'messages'), {
      ...message,
      userId: message.userId ?? 'admin',
      isMe: message.isMe ?? false,
      time,
      date,
      createdAt: serverTimestamp(),
    });
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
      return {
        id: doc.id,
        ...data,
        date: data.date || '',
        time: data.time || '',
        name: data.name || '',
        route: data.route || '',
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

/**
 * tracks 목록 조회
 * - 문서 내 points 배열 또는 points 서브컬렉션 모두 지원
 */
export async function getTracks(filters?: { date?: string; routeName?: string; reportCountZeroOnly?: boolean }): Promise<Track[]> {
  try {
    const snapshot = await getDocs(collection(db, 'tracks'));
    let tracks = snapshot.docs.map((d) => {
      const data = d.data();
      const reportCount = data.reportCount ?? data.보고인원 ?? data.headcount ?? 0;
      const startedAt = data.startedAt?.toDate?.() ?? data.startedAt;
      const createdAt = data.createdAt?.toDate?.() ?? data.timestamp?.toDate?.() ?? startedAt ?? data.createdAt ?? data.timestamp;
      const startTimeRaw = data.startedAt?.toDate?.() ?? data.startedAt ?? data.startTime?.toDate?.() ?? data.startTime ?? data.time ?? data.departureTime ?? data.시작시간;
      let dateStr = data.date ?? data.운행일 ?? data.startDate;
      if (!dateStr && (startedAt || createdAt)) {
        const d = (startedAt || createdAt) instanceof Date ? (startedAt || createdAt) : new Date(startedAt || createdAt);
        dateStr = d.toISOString().slice(0, 10);
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
        routeName: data.route ?? data.routeName ?? data.name ?? data.노선,
        subRoute: data.subRoute ?? data.세부노선,
        driverId: data.driverId,
        driverName: data.name ?? data.driverName ?? data.driver ?? (typeof data.driver === "object" ? data.driver?.name : null) ?? data.userName ?? data.기사명,
        date: dateStr,
        startTime: startTimeVal,
        endTime: data.endedAt?.toDate?.() ?? data.endedAt ?? data.endTime?.toDate?.() ?? data.endTime,
        carNumber: data.car ?? data.carNumber ?? data.vehicleNumber ?? data.차량번호,
        reportCount: Number(reportCount),
      } as Track;
    });
    if (filters?.reportCountZeroOnly !== false) {
      tracks = tracks.filter((t) => t.reportCount === 0);
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

/** 포인트 객체에서 lat/lng/부가정보 추출 (다양한 필드명 지원) */
function parsePoint(p: Record<string, unknown>): TrackPoint | null {
  const lat = Number(p.lat ?? p.latitude ?? p.Lat ?? (p.coord as Record<string, unknown>)?.lat);
  const lng = Number(p.lng ?? p.longitude ?? p.Lng ?? (p.coord as Record<string, unknown>)?.lng);
  if (isNaN(lat) || isNaN(lng)) return null;
  const tsRaw =
    p.ts ??
    (p.timestamp as { toMillis?: () => number })?.toMillis?.() ??
    (p.timestamp ? new Date(p.timestamp as string).getTime() : 0);
  const ts = Number(tsRaw) || undefined;
  const speedRaw = Number(p.speed ?? p.velocity ?? 0);
  const headingRaw = Number(p.heading ?? p.bearing ?? 0);
  const accuracyRaw = Number(p.accuracy ?? p.acc ?? p.horizontalAccuracy ?? 0);
  return {
    lat,
    lng,
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
  const tsRaw = p.ts ?? (p.timestamp as { toMillis?: () => number })?.toMillis?.() ?? (p.timestamp ? new Date(p.timestamp as string).getTime() : 0);
  const ts = Number(tsRaw) || 0;
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
      const sorted = [...pointsFromArray].sort((a, b) => {
        const getTs = (p: Record<string, unknown>) => {
          const ts = p.ts ?? (p.timestamp as { toMillis?: () => number })?.toMillis?.() ?? (p.timestamp ? new Date(p.timestamp as string).getTime() : 0);
          return Number(ts) || 0;
        };
        return getTs(a as Record<string, unknown>) - getTs(b as Record<string, unknown>);
      });
      return sorted.map((p) => parsePoint(p as Record<string, unknown>)).filter((x): x is TrackPoint => x !== null);
    }

    const pointsRef = collection(db, 'tracks', trackId, 'points');
    try {
      const pointsQuery = query(pointsRef, orderBy('timestamp', 'asc'));
      const pointsSnap = await getDocs(pointsQuery);
      return pointsSnap.docs
        .map((d) => parsePoint(d.data() as Record<string, unknown>))
        .filter((x): x is TrackPoint => x !== null);
    } catch {
      const pointsSnap = await getDocs(pointsRef);
      return pointsSnap.docs
        .map((d) => parsePoint(d.data() as Record<string, unknown>))
        .filter((x): x is TrackPoint => x !== null);
    }
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
      const sorted = [...pointsFromArray].sort((a, b) => {
        const getTs = (p: Record<string, unknown>) => {
          const ts = p.ts ?? (p.timestamp as { toMillis?: () => number })?.toMillis?.() ?? (p.timestamp ? new Date(p.timestamp as string).getTime() : 0);
          return Number(ts) || 0;
        };
        return getTs(a as Record<string, unknown>) - getTs(b as Record<string, unknown>);
      });
      return sorted
        .map((p) => parsePointForExport(p as Record<string, unknown>))
        .filter((x): x is { lat: number; lng: number; speed: number; heading: number; ts: number } => x !== null);
    }

    const pointsRef = collection(db, 'tracks', trackId, 'points');
    try {
      const pointsQuery = query(pointsRef, orderBy('timestamp', 'asc'));
      const pointsSnap = await getDocs(pointsQuery);
      return pointsSnap.docs
        .map((d) => parsePointForExport(d.data() as Record<string, unknown>))
        .filter((x): x is { lat: number; lng: number; speed: number; heading: number; ts: number } => x !== null);
    } catch {
      const pointsSnap = await getDocs(pointsRef);
      return pointsSnap.docs
        .map((d) => parsePointForExport(d.data() as Record<string, unknown>))
        .filter((x): x is { lat: number; lng: number; speed: number; heading: number; ts: number } => x !== null);
    }
  } catch (error) {
    console.error('Error getting track points for export:', error);
    return [];
  }
}

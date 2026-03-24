export interface User {
  uid: string;
  name: string;
  phone: string;
  company: string;
  driverId: string;
  role: "superAdmin" | "manager" | "driver";
  car?: string;
  pushToken?: string;
  updatedAt?: Date;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  company: string;
  role?: "driver" | "manager" | "superAdmin";
  car?: string;
  note?: string;
  specialNote?: string;
  createdAt?: Date;
}

export interface Room {
  id: number;
  name: string;
  lastMsg?: string;
  time?: string;
  unread?: number;
  companies?: string[];
  subRoutes?: string[];
  reportMode?: "normal" | "summary";
  adminOnly?: boolean;
  pinned?: boolean;
  timetableImages?: string[];
  navLinks?: { label: string; url: string }[];
}

export interface Company {
  name: string;
  password: string;
  mode?: "normal" | "summary";
}

export interface Vehicle {
  id: number;
  carNumber: string;
  model: string;
  capacity: number;
  inspectionExpiry: string;
  driver: string;
  note: string;
}

export interface ReportMessage {
  id: string;
  userId: string;
  name: string;
  time: string;
  date: string;
  type: "report";
  route: string;
  subRoute?: string;
  car: string;
  reportData: {
    type: "출근" | "퇴근" | "야간";
    count: number;
    maxCount: number;
    isOverCapacity: boolean;
  };
}

/** 인원보고 + 방·시각 메타 (이상 감지용) — 조회는 `date` 필터, 구간·간격은 `createdAt`(서울) 기준 */
export interface EnrichedReportMessage extends ReportMessage {
  roomId: string;
  createdAt: Date;
  driverId?: string;
}

export interface EmergencyMessage {
  id: string;
  userId?: string;
  name: string;
  time: string;
  date: string;
  type: "emergency";
  emergencyType: "차량 고장" | "응급 환자" | "사고 발생" | "승객 난동";
  phone?: string;
  car?: string;
  route?: string;
  status?: "처리중" | "완료";
  detail?: string;
  adminComment?: string; // 관리자 코멘트
  roomId?: string; // 긴급호출 메시지가 속한 채팅방 ID (상태 변경용)
}

export interface NoticeMessage {
  id: string;
  userId: string;
  name: string;
  text: string;
  time: string;
  date: string;
  type: "notice";
  targetCompanies?: string[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  driverId?: string;
  name: string;
  avatar?: string;
  text?: string | null;
  time: string;
  date: string;
  type: "text" | "report" | "notice" | "image" | "emergency" | "summary" | "summary_next_day" | "dbResult";
  isMe: boolean;
  createdAt?: Date;
  reactions?: Record<string, string[]>;
  reportData?: ReportMessage["reportData"];
  emergencyType?: EmergencyMessage["emergencyType"];
  imageUrl?: string;
  route?: string;
  subRoute?: string;
  car?: string;
  phone?: string;
}

export interface TrackPoint {
  lat: number;
  lng: number;
  ts?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  timestamp?: { toDate?: () => Date; toMillis?: () => number };
}

export interface Track {
  id: string;
  routeName?: string;
  subRoute?: string;
  driverId?: string;
  driverName?: string;
  date?: string;
  startTime?: Date | string;
  endTime?: Date | string;
  carNumber?: string;
  reportCount?: number; // 보고인원
  points?: TrackPoint[];
}

export type NavPage =
  | "dashboard"
  | "reports"
  | "emergency"
  | "rooms"
  | "monitoring"
  | "drivers"
  | "companies"
  | "notice"
  | "chat";

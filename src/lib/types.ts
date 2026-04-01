export interface User {
  uid: string;
  name: string;
  phone: string;
  company: string;
  driverId: string;
  role: "superAdmin" | "manager" | "driver";
  /** Firestore `users.role` 원문 — 보안 규칙의 isSuperRole / isManagerRole 과 동일하게 판별 */
  firestoreRole?: string;
  /** Firestore `users.isAdmin` — 규칙상 isElevatedAdmin 에 포함 */
  isAdminLegacy?: boolean;
  car?: string;
  pushToken?: string;
  updatedAt?: Date;
}

/** 관리자 기사·회원 목록 — Firestore `users` 컬렉션 기준 */
export interface UserDirectoryRow {
  uid: string;
  name: string;
  phone: string;
  company: string;
  driverId: string;
  role: User["role"];
  /** 표시용 아이디 (email · loginEmail · loginId · driverId · uid 순) */
  displayId: string;
  car?: string;
  note?: string;
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
  /** (선택) 앱 로그인용 이메일 형식 ID — DB에 있으면 표시 */
  loginEmail?: string;
  /** (선택) Firebase Auth UID 등 */
  authUid?: string;
  /** (선택) DB에 평문으로 남아 있으면 표시 */
  loginPassword?: string;
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
  /** 레거시: 슬롯 분리 전 단일 배열 (앱은 timetable1Images 키 없을 때만 사용) */
  timetableImages?: string[];
  /** 배차표1 — Firestore timetable1Images */
  timetable1Images?: string[];
  /** 배차표2 — Firestore timetable2Images */
  timetable2Images?: string[];
  /**
   * getRooms에서만 설정. Firestore에 timetable1Images 또는 timetable2Images 키가 있으면 true (앱 RoomModel 파싱과 동일).
   * 저장 시 제거해야 함.
   */
  timetableUsesSplitFields?: boolean;
  navLinks?: { label: string; url: string }[];
}

export interface Company {
  name: string;
  password: string;
  mode?: "normal" | "summary";
}

/** 팀 공유 업무 달력 (Firestore config/workspace_calendar) */
export interface WorkspaceCalendarItem {
  id: string;
  title: string;
  kind: "schedule" | "todo";
  /** YYYY-MM-DD */
  date: string;
  /** 포함 종료일 (기간 일정용, 없으면 단일일) */
  endDate?: string;
  startTime?: string;
  endTime?: string;
  done?: boolean;
  /** 웹 콘솔에서 항목을 추가한 관리자 이름 */
  createdByName?: string;
  /** 할 일 완료 토글 등 마지막으로 수정한 관리자 이름 */
  lastEditedByName?: string;
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

/** 관리자 웹 차량 관리 전용 — Firestore `config/vehicle_registry` 의 `items` 배열 요소 */
export interface VehicleRegistryItem {
  id: string;
  company: string;
  carNumber: string;
  driverName: string;
  phone: string;
  note?: string;
  /** 같은 소속(company) 안에서만 쓰는 표시 순서. 없으면 차량번호·성명으로 자동 정렬 */
  orderInCompany?: number;
}

export interface ReportMessage {
  id: string;
  userId: string;
  name: string;
  phone?: string;
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
  /** Firestore tracks.ownerUid */
  ownerUid?: string;
  roomId?: number | string;
  isActive?: boolean;
}

export type NavPage =
  | "dashboard"
  | "routeOperation"
  | "reports"
  | "peakAnalysis"
  | "emergency"
  | "rooms"
  | "monitoring"
  | "dispatch"
  | "drivers"
  | "vehicleManagement"
  | "companies"
  | "notice"
  | "chat";

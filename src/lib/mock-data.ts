import type {
  Driver,
  Room,
  Company,
  Vehicle,
  ReportMessage,
  EmergencyMessage,
  NoticeMessage,
  ChatMessage,
} from "./types";

export const mockDrivers: Driver[] = [
  { id: "A업체|01012345678", name: "홍길동", phone: "010-1234-5678", company: "A업체", car: "경기 78사 2918호", role: "driver", note: "" },
  { id: "A업체|01023456789", name: "김철수", phone: "010-2345-6789", company: "A업체", car: "경기 72바 1234호", role: "manager", note: "야간 운행 불가", specialNote: "야간 운행 불가" },
  { id: "B업체|01034567890", name: "박영희", phone: "010-3456-7890", company: "B업체", car: "경기 15나 5678호", role: "driver", note: "" },
  { id: "C업체|01045678901", name: "이민수", phone: "010-4567-8901", company: "C업체", car: "경기 33가 9999호", role: "driver", note: "신규 기사", specialNote: "신규 기사 (2026년 3월 입사)" },
  { id: "D업체|01056789012", name: "최지영", phone: "010-5678-9012", company: "D업체", car: "경기 55나 7777호", role: "driver", note: "" },
  { id: "A업체|01067890123", name: "강동원", phone: "010-6789-0123", company: "A업체", car: "경기 88자 3333호", role: "driver", note: "" },
  { id: "B업체|01078901234", name: "정수연", phone: "010-7890-1234", company: "B업체", car: "경기 22가 4444호", role: "driver", note: "" },
  { id: "C업체|01089012345", name: "윤서준", phone: "010-8901-2345", company: "C업체", car: "경기 44나 5555호", role: "driver", note: "" },
];

export const mockRooms: Room[] = [
  { id: 1, name: "독성리", companies: ["A업체", "B업체"], subRoutes: ["A-1", "A-2"], reportMode: "normal", lastMsg: "홍길동: 출근 38명 보고", time: "08:12" },
  { id: 2, name: "가좌리", companies: ["A업체", "C업체"], reportMode: "normal", lastMsg: "김철수: 출근 41명 보고", time: "08:25" },
  { id: 3, name: "가재월리", companies: ["B업체", "D업체"], subRoutes: ["B-1", "B-2", "B-3"], reportMode: "normal", lastMsg: "박영희: 출근 33명 보고", time: "08:31" },
  { id: 4, name: "서측공동구", companies: ["C업체"], reportMode: "summary", lastMsg: "이민수: 출퇴근 통합 보고", time: "08:44" },
  { id: 5, name: "두창리", companies: ["A업체", "B업체", "C업체"], reportMode: "normal", lastMsg: "강동원: 출근 43명 보고", time: "08:55" },
  { id: 6, name: "원삼", companies: ["D업체"], reportMode: "normal", lastMsg: "최지영: 퇴근 39명 보고", time: "17:30" },
  { id: 7, name: "양지", companies: ["A업체", "B업체"], reportMode: "normal", lastMsg: "한상우: 출근 40명 보고", time: "08:18" },
  { id: 8, name: "백암", companies: ["A업체"], reportMode: "normal", lastMsg: "오정민: 출근 35명 보고", time: "08:22" },
  { id: 9, name: "천리", companies: ["B업체", "C업체"], reportMode: "normal", lastMsg: "임재혁: 출근 29명 보고", time: "08:35" },
  { id: 10, name: "양지 파인리조트", companies: ["C업체", "D업체"], reportMode: "normal", lastMsg: "서동혁: 출근 37명 보고", time: "08:40" },
  { id: 11, name: "용인", companies: ["A업체", "C업체"], reportMode: "normal", lastMsg: "배수정: 출근 44명 보고", time: "08:08" },
  { id: 12, name: "안성 공도읍", companies: ["B업체"], reportMode: "normal", lastMsg: "송민호: 출근 32명 보고", time: "08:28" },
  { id: 13, name: "안성 롯데마트앞", companies: ["D업체"], reportMode: "normal", lastMsg: "권지훈: 출근 26명 보고", time: "08:45" },
  { id: 14, name: "안성 중앙대", companies: ["A업체", "D업체"], reportMode: "normal", lastMsg: "문성호: 출근 31명 보고", time: "08:33" },
  { id: 15, name: "안성 시외버스터미널", companies: ["B업체", "C업체"], reportMode: "normal", lastMsg: "장현우: 출근 22명 보고", time: "08:50" },
  { id: 16, name: "안성 죽산면", companies: ["C업체"], reportMode: "normal", lastMsg: "유진호: 출근 18명 보고", time: "08:55" },
  { id: 998, name: "🗂 기사·차량 관리", adminOnly: true, pinned: true, lastMsg: "관리자: 홍길동 검색", time: "09:01" },
  { id: 999, name: "📊 운행 관리 현황", adminOnly: true, pinned: true, lastMsg: "시스템: 출근 집계 완료", time: "09:14" },
];

export const mockCompanies: Company[] = [
  { name: "A업체", password: "a1234", mode: "normal" },
  { name: "B업체", password: "b5678", mode: "normal" },
  { name: "C업체", password: "c9012", mode: "summary" },
  { name: "D업체", password: "d3456", mode: "normal" },
];

export const mockVehicles: Vehicle[] = [
  { id: 1, carNumber: "경기 78사 2918호", model: "현대 유니버스", capacity: 45, inspectionExpiry: "2026-08-15", driver: "홍길동", note: "" },
  { id: 2, carNumber: "경기 72바 1234호", model: "현대 에어로", capacity: 41, inspectionExpiry: "2026-07-01", driver: "김철수", note: "" },
  { id: 3, carNumber: "경기 15나 5678호", model: "기아 그랜버드", capacity: 44, inspectionExpiry: "2027-01-20", driver: "박영희", note: "에어컨 점검 필요" },
  { id: 4, carNumber: "경기 33가 9999호", model: "현대 유니버스", capacity: 45, inspectionExpiry: "2026-10-05", driver: "이민수", note: "" },
  { id: 5, carNumber: "경기 55나 7777호", model: "기아 그랜버드", capacity: 44, inspectionExpiry: "2027-04-15", driver: "최지영", note: "" },
];

export const mockReports: ReportMessage[] = [
  { id: "r1", userId: "u1", name: "홍길동", time: "08:12", date: "2026-03-20", type: "report", route: "독성리", subRoute: "A-1", car: "경기 78사 2918호", reportData: { type: "출근", count: 38, maxCount: 45, isOverCapacity: false } },
  { id: "r2", userId: "u2", name: "김철수", time: "08:25", date: "2026-03-20", type: "report", route: "가좌리", car: "경기 72바 1234호", reportData: { type: "출근", count: 41, maxCount: 41, isOverCapacity: false } },
  { id: "r3", userId: "u3", name: "박영희", time: "08:31", date: "2026-03-20", type: "report", route: "가재월리", subRoute: "B-1", car: "경기 15나 5678호", reportData: { type: "출근", count: 33, maxCount: 44, isOverCapacity: false } },
  { id: "r4", userId: "u4", name: "이민수", time: "08:44", date: "2026-03-20", type: "report", route: "서측공동구", car: "경기 33가 9999호", reportData: { type: "출근", count: 42, maxCount: 45, isOverCapacity: false } },
  { id: "r5", userId: "u5", name: "강동원", time: "08:55", date: "2026-03-20", type: "report", route: "두창리", car: "경기 88자 3333호", reportData: { type: "출근", count: 43, maxCount: 45, isOverCapacity: false } },
  { id: "r6", userId: "u6", name: "최지영", time: "17:30", date: "2026-03-19", type: "report", route: "원삼", car: "경기 55나 7777호", reportData: { type: "퇴근", count: 39, maxCount: 44, isOverCapacity: false } },
  { id: "r7", userId: "u7", name: "정수연", time: "08:15", date: "2026-03-20", type: "report", route: "독성리", subRoute: "A-2", car: "경기 22가 4444호", reportData: { type: "출근", count: 36, maxCount: 44, isOverCapacity: false } },
  { id: "r8", userId: "u8", name: "윤서준", time: "08:50", date: "2026-03-20", type: "report", route: "가재월리", subRoute: "B-2", car: "경기 44나 5555호", reportData: { type: "출근", count: 28, maxCount: 45, isOverCapacity: false } },
  { id: "r9", userId: "u9", name: "한상우", time: "08:18", date: "2026-03-20", type: "report", route: "양지", car: "경기 11가 1111호", reportData: { type: "출근", count: 40, maxCount: 45, isOverCapacity: false } },
  { id: "r10", userId: "u10", name: "오정민", time: "08:22", date: "2026-03-20", type: "report", route: "백암", car: "경기 22나 2222호", reportData: { type: "출근", count: 35, maxCount: 44, isOverCapacity: false } },
  { id: "r11", userId: "u11", name: "임재혁", time: "08:35", date: "2026-03-20", type: "report", route: "천리", car: "경기 33다 3333호", reportData: { type: "출근", count: 29, maxCount: 41, isOverCapacity: false } },
  { id: "r12", userId: "u12", name: "서동혁", time: "08:40", date: "2026-03-20", type: "report", route: "양지 파인리조트", car: "경기 44라 4444호", reportData: { type: "출근", count: 37, maxCount: 45, isOverCapacity: false } },
  { id: "r13", userId: "u13", name: "배수정", time: "08:08", date: "2026-03-20", type: "report", route: "용인", car: "경기 55마 5555호", reportData: { type: "출근", count: 44, maxCount: 45, isOverCapacity: false } },
  { id: "r14", userId: "u14", name: "송민호", time: "08:28", date: "2026-03-20", type: "report", route: "안성 공도읍", car: "경기 66바 6666호", reportData: { type: "출근", count: 32, maxCount: 44, isOverCapacity: false } },
  { id: "r15", userId: "u15", name: "권지훈", time: "08:45", date: "2026-03-20", type: "report", route: "안성 롯데마트앞", car: "경기 77사 7777호", reportData: { type: "출근", count: 26, maxCount: 41, isOverCapacity: false } },
  { id: "r16", userId: "u16", name: "문성호", time: "08:33", date: "2026-03-20", type: "report", route: "안성 중앙대", car: "경기 88아 8888호", reportData: { type: "출근", count: 31, maxCount: 44, isOverCapacity: false } },
  { id: "r17", userId: "u17", name: "장현우", time: "08:50", date: "2026-03-20", type: "report", route: "안성 시외버스터미널", car: "경기 99자 9999호", reportData: { type: "출근", count: 22, maxCount: 41, isOverCapacity: false } },
  { id: "r18", userId: "u18", name: "유진호", time: "08:55", date: "2026-03-20", type: "report", route: "안성 죽산면", car: "경기 10차 1010호", reportData: { type: "출근", count: 18, maxCount: 41, isOverCapacity: false } },
];

export const mockEmergencies: EmergencyMessage[] = [
  { id: "e1", userId: "u3", name: "박영희", time: "09:04", date: "2026-03-20", type: "emergency", emergencyType: "차량 고장", phone: "010-3456-7890", car: "경기 15나 5678호", route: "가재월리", status: "처리중", detail: "엔진 경고등 점등" },
  { id: "e2", userId: "u2", name: "김철수", time: "18:22", date: "2026-03-19", type: "emergency", emergencyType: "승객 난동", phone: "010-2345-6789", car: "경기 72바 1234호", route: "가좌리", status: "완료", detail: "취객 승객 소란" },
  { id: "e3", userId: "u1", name: "홍길동", time: "07:45", date: "2026-03-18", type: "emergency", emergencyType: "응급 환자", phone: "010-1234-5678", car: "경기 78사 2918호", route: "독성리", status: "완료", detail: "승객 갑작스러운 복통" },
];

export const mockNotices: NoticeMessage[] = [
  { id: "n1", userId: "admin", name: "관리자", text: "오전 운행 시간이 08:00에서 07:50으로 변경됩니다.", time: "09:00", date: "2026-03-20", type: "notice" },
  { id: "n2", userId: "admin", name: "관리자", text: "독성리·가좌리 노선 정류장이 추가됩니다. 상세 내용은 배차표를 확인해 주세요.", time: "17:30", date: "2026-03-19", type: "notice", targetCompanies: ["A업체", "B업체"] },
  { id: "n3", userId: "admin", name: "관리자", text: "3월 급여 정산 안내문입니다. 확인 부탁드립니다.", time: "10:00", date: "2026-03-15", type: "notice" },
  { id: "n4", userId: "admin", name: "관리자", text: "차량 정기 점검 일정 안내입니다. 해당 기사님은 시간 확인 부탁드립니다.", time: "14:00", date: "2026-03-14", type: "notice" },
];

export const mockChatMessages: ChatMessage[] = [
  { id: "m1", userId: "u1", name: "홍길동", avatar: "홍", text: "출근합니다. 독성리 A-1 출발합니다.", time: "07:55", date: "2026-03-20", type: "text", isMe: false },
  { id: "m2", userId: "u1", name: "홍길동", avatar: "홍", time: "08:12", date: "2026-03-20", type: "report", isMe: false, reportData: { type: "출근", count: 38, maxCount: 45, isOverCapacity: false } },
  { id: "m3", userId: "admin", name: "관리자", avatar: "관", text: "오전 운행 시간이 08:00에서 07:50으로 변경됩니다.", time: "09:00", date: "2026-03-20", type: "notice", isMe: true },
  { id: "m4", userId: "u2", name: "김철수", avatar: "김", text: "가좌리 출발합니다.", time: "08:10", date: "2026-03-20", type: "text", isMe: false },
  { id: "m5", userId: "u2", name: "김철수", avatar: "김", time: "08:25", date: "2026-03-20", type: "report", isMe: false, reportData: { type: "출근", count: 41, maxCount: 41, isOverCapacity: false } },
  { id: "m6", userId: "u3", name: "박영희", avatar: "박", text: "가재월리 출발합니다.", time: "08:20", date: "2026-03-20", type: "text", isMe: false },
  { id: "m7", userId: "u3", name: "박영희", avatar: "박", time: "09:04", date: "2026-03-20", type: "emergency", isMe: false, emergencyType: "차량 고장" },
];

export const avatarThemes = [
  { key: "blue", bg: "#E3F2FD", fg: "#1565C0" },
  { key: "amber", bg: "#FFF8E1", fg: "#F57F17" },
  { key: "coral", bg: "#FFEBEE", fg: "#C62828" },
  { key: "teal", bg: "#E0F2F1", fg: "#00695C" },
  { key: "purple", bg: "#F3E5F5", fg: "#6A1B9A" },
  { key: "green", bg: "#E8F5E9", fg: "#2E7D32" },
];

export function getAvatarTheme(name: string) {
  const idx =
    name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    avatarThemes.length;
  return avatarThemes[idx];
}

export function getReportRate(count: number, max: number) {
  return Math.round((count / max) * 100);
}

export function formatDate(dateStr: string) {
  const today = "2026-03-20";
  const yesterday = "2026-03-19";
  if (dateStr === today) return "오늘";
  if (dateStr === yesterday) return "어제";
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
}

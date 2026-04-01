/**
 * 앱·웹이 Firestore에 남기는 메시지 스키마가 방 타입별로 달라,
 * `text` 가 비어 있어도 본문을 뽑기 위한 공통 유틸 (정비·예약 등).
 */

function stringField(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  return '';
}

function collectMessageFragments(data: Record<string, unknown>, depth: number): string[] {
  if (depth <= 0) return [];
  const keys = [
    'detail',
    'description',
    'message',
    'body',
    'content',
    'memo',
    'notes',
    'title',
    'subtitle',
    'reason',
    'status',
    '내용',
    '메모',
    '사유',
    '제목',
    '차량번호',
    '노선',
    '예약일',
    '예약시간',
    '예약내용',
    '정비내용',
  ];
  const parts: string[] = [];
  for (const k of keys) {
    const s = stringField(data, k);
    if (s) parts.push(s);
  }

  const nestKeys = ['reservation', 'booking', 'appointment', 'maintenanceData', 'repairInfo', 'metadata', 'extra', 'payload', 'data'];
  for (const nk of nestKeys) {
    const nested = data[nk];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      parts.push(...collectMessageFragments(nested as Record<string, unknown>, depth - 1));
    }
  }

  return parts;
}

/** `text` 가 없을 때 중첩·한글 필드까지 훑어 한 줄 요약용 문자열 생성 */
export function messageBodyForDisplay(data: Record<string, unknown>): string {
  const text = stringField(data, 'text');
  if (text) return text;

  const fragments = collectMessageFragments(data, 4);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const f of fragments) {
    if (!f || seen.has(f)) continue;
    seen.add(f);
    unique.push(f);
  }
  return unique.join(' · ');
}

const MAINTENANCE_TYPE_RE =
  /maintenance|repair|reservation|service|booking|정비|예약|svc_|workorder|work_order/i;

const MAINTENANCE_TYPE_EXACT = new Set([
  'maintenance',
  'repair',
  'reservation',
  'service_booking',
  'maintenance_request',
  'maintenance_booking',
  'repair_request',
  'appointment',
]);

/** 정비방·예약 등 구조화 메시지로 취급할 Firestore `type` 값 */
export function isMaintenanceLikeType(type: string | undefined): boolean {
  const t = (type || '').trim();
  if (!t) return false;
  if (MAINTENANCE_TYPE_EXACT.has(t.toLowerCase())) return true;
  return MAINTENANCE_TYPE_RE.test(t);
}

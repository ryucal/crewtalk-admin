/**
 * 모바일 앱(Flutter) PhoneAuthUtils 와 동일: 전화번호 → Firebase Email/Password용 가짜 이메일
 * synthetic: `{digits}@crew.co.kr`
 */
const NON_DIGIT = /\D/g;

export function digitsOnly(input: string): string {
  return input.replace(NON_DIGIT, "");
}

/** 010xxxxxxxx — 10~11자리 숫자 */
export function isValidKoreanMobileDigits(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 11;
}

export function syntheticEmailFromDigits(digits: string): string {
  if (!digits) return "";
  return `${digits}@crew.co.kr`;
}

/** 010-1234-5678 형태 (최대 11자리) */
export function formatKrMobileInput(raw: string): string {
  const d = digitsOnly(raw).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

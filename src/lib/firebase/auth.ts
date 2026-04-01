import {
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './config';
import { coerceUserPhoneFromDoc, parseUserRoleFromDoc } from '@/lib/firebase/firestore';
import {
  digitsOnly,
  isValidKoreanMobileDigits,
  syntheticEmailFromDigits,
} from '@/lib/phone-auth';
import type { User } from '@/lib/types';

/**
 * 익명 로그인 (앱과 동일한 방식)
 */
export async function loginAnonymously() {
  const userCredential = await signInAnonymously(auth);
  return userCredential.user;
}

/**
 * 이메일/비밀번호로 로그인
 */
export async function loginWithEmail(email: string, password: string) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/**
 * 앱과 동일: 전화번호(표시 형식 가능) + 개인 비밀번호 → `{digits}@crew.co.kr` 로 Firebase 로그인
 */
export async function loginWithPhoneAndPassword(
  phoneFormatted: string,
  personalPassword: string,
) {
  const digits = digitsOnly(phoneFormatted);
  if (!isValidKoreanMobileDigits(digits)) {
    throw new Error("auth/invalid-phone");
  }
  const email = syntheticEmailFromDigits(digits);
  const userCredential = await signInWithEmailAndPassword(
    auth,
    email,
    personalPassword,
  );
  return userCredential.user;
}

/**
 * 로그아웃
 */
export async function logout() {
  await signOut(auth);
}

/**
 * 현재 로그인한 사용자의 프로필 정보 가져오기
 */
export async function getCurrentUserProfile(): Promise<User | null> {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) return null;
    
    const data = userDoc.data();
    const companyRaw = data.company;
    const company =
      typeof companyRaw === 'string'
        ? companyRaw.trim()
        : companyRaw != null
          ? String(companyRaw).trim()
          : '';
    const firestoreRole =
      typeof data.role === 'string'
        ? data.role
        : data.role != null
          ? String(data.role)
          : '';
    const isAdminLegacy =
      data.isAdmin === true || data.isAdmin === "true" || String(data.isAdmin).toLowerCase() === "true";
    return {
      uid: user.uid,
      name: data.name || '',
      phone: coerceUserPhoneFromDoc(data as Record<string, unknown>),
      company,
      driverId: data.driverId || '',
      role: parseUserRoleFromDoc(data as Record<string, unknown>),
      firestoreRole,
      isAdminLegacy,
      car: data.car,
      pushToken: data.pushToken,
      updatedAt: data.updatedAt?.toDate(),
    } as User;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * 웹 콘솔 접근 — Firestore `isStaffElevated()` / `isElevatedAdmin()` 과 맞춤
 * (superadmin·manager 는 role 문자열 .lower(), company 는 「관리자」, 또는 users.isAdmin)
 */
export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  if (user.isAdminLegacy === true) return true;
  const fr = (user.firestoreRole ?? "").trim();
  const rl = fr.toLowerCase();
  const companyOk = user.company === "관리자";
  const staffRoleOk = fr.length > 0 && (rl === "superadmin" || rl === "manager");
  return staffRoleOk || companyOk;
}

/**
 * 웹 관리자 콘솔(B 방식): Firestore `users.role` 이 superAdmin(대소문자 무관) 인 계정만
 */
export function isWebConsoleSuperAdmin(user: User | null): boolean {
  if (!user) return false;
  return (user.firestoreRole ?? "").trim().toLowerCase() === "superadmin";
}

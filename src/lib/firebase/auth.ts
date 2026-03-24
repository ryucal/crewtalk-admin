import { 
  signInAnonymously, 
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './config';
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
    return {
      uid: user.uid,
      name: data.name || '',
      phone: data.phone || '',
      company: data.company || '',
      driverId: data.driverId || '',
      role: data.role || 'driver',
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
 * 관리자 권한 확인
 */
export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  return (
    user.role === "superAdmin" ||
    user.company === "관리자" ||
    (user as any)?.isAdmin === true
  );
}

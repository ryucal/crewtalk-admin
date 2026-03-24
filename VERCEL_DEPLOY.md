# Vercel 배포 가이드 - crewtalk-admin

## 1. 새 프로젝트로 배포 (busschedule과 구분)

- **프로젝트 이름**: `crewtalk-admin` (busschedule.vercel.app과 별도)
- **예상 URL**: `https://crewtalk-admin.vercel.app`

## 2. Vercel에 필요한 환경 변수

배포 후 Vercel 대시보드 → Project Settings → Environment Variables에서 추가:

| 변수명 | 용도 | crewtalk8 예시 |
|--------|------|----------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API Key | `AIzaSyCdSYBQ1RxPjKHDmhb85WxTEQHZsakDG-k` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `crewtalk8.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID | `crewtalk8` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage | `crewtalk8.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging | `297756278549` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase App ID | `1:297756278549:web:48b63705da933b4d94b31c` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase Analytics (선택) | `G-TVZKQ8ZY1H` |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 네이버 지도 API (관제 시스템) | (네이버 클라우드 콘솔에서 발급) |

로컬 개발 시 `.env.example`을 복사해 `.env.local`로 만들고 값을 채우세요.

## 3. Firebase Firestore 규칙·인덱스 배포 (crewtalk8)

새 프로젝트 사용 시 Firestore 규칙·인덱스를 한 번 배포합니다:

```bash
firebase login
firebase use crewtalk8   # .firebaserc에 이미 설정됨
firebase deploy --only firestore
```

## 4. 네이버 맵 Web 서비스 URL 등록

Vercel 배포 후 **반드시** 네이버 클라우드 콘솔에서 Web 서비스 URL 추가:

- `https://crewtalk-admin.vercel.app`
- (커스텀 도메인 사용 시 해당 URL도 추가)

## 5. Firebase Auth 인증 도메인

Firebase Console → Authentication → Settings → Authorized domains에 다음을 추가:

- `localhost` (개발용)
- Vercel 배포 도메인 (예: `crewtalk-admin-xxx.vercel.app`)
- 커스텀 도메인 (사용 시)

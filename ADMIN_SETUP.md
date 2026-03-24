# 관리자(superAdmin) 계정 설정 가이드

관리자 웹 로그인을 사용하려면 Firebase에 superAdmin 계정을 생성해야 합니다.

## 1. Firebase Authentication에서 사용자 생성

1. [Firebase Console](https://console.firebase.google.com/project/crewtalk8/authentication/users) 접속
2. **Authentication** → **Users** → **Add user** 클릭
3. 이메일과 비밀번호 입력 (예: `admin@crewtalk.co.kr`)
4. **Add user** 클릭
5. 생성된 사용자의 **User UID** 복사 (나중에 Firestore에 필요)

## 2. Firestore에 사용자 프로필 생성

1. [Firestore Console](https://console.firebase.google.com/project/crewtalk8/firestore) 접속
2. **Firestore Database** → **데이터** 탭
3. `users` 컬렉션 선택 (없으면 생성)
4. **문서 추가** 클릭
5. **문서 ID**: 1단계에서 복사한 **User UID** 입력
6. 필드 추가:
   | 필드 | 유형 | 값 |
   |------|------|-----|
   | name | string | 관리자 |
   | role | string | superAdmin |
   | company | string | 관리자 |
   | phone | string | (선택) |

7. **저장** 클릭

## 3. 로그인 테스트

1. 관리자 웹 접속
2. 로그인 페이지에서 1단계에서 만든 이메일/비밀번호 입력
3. 로그인 성공 시 대시보드 표시

## 참고

- `role`이 `superAdmin`이 아니면 "관리자 권한이 없습니다" 메시지가 표시됩니다.
- Firestore 보안 규칙에서 `config` 쓰기는 `role == "superAdmin"` 사용자만 허용됩니다.

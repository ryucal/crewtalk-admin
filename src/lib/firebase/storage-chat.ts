import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./config";

/** Storage 규칙 `request.resource.size` 상한(15MB)과 맞춤 */
const MAX_BYTES = 15 * 1024 * 1024;

function randomSuffix(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 채팅용 이미지를 Storage에 올리고 HTTPS 다운로드 URL 반환
 * 경로: rooms/{roomId}/images/{timestamp}_{uuid}.ext (앱 ChatFirestoreRepository.uploadChatImage 와 동일 규칙)
 */
export async function uploadChatImage(roomId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("이미지는 15MB 이하만 업로드할 수 있습니다.");
  }
  const extFromName = file.name.split(".").pop();
  const ext =
    extFromName && /^[a-z0-9]+$/i.test(extFromName) && extFromName.length <= 8
      ? extFromName.toLowerCase()
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : file.type === "image/gif"
            ? "gif"
            : "jpg";
  const name = `${Date.now()}_${randomSuffix()}.${ext}`;
  const path = `rooms/${roomId}/images/${name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "image/jpeg",
  });
  return getDownloadURL(storageRef);
}

/**
 * 배차 시간표용 — Storage 경로·규칙은 채팅 이미지와 동일, 파일명만 구분
 */
export async function uploadTimetableImage(roomId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("이미지는 15MB 이하만 업로드할 수 있습니다.");
  }
  const extFromName = file.name.split(".").pop();
  const ext =
    extFromName && /^[a-z0-9]+$/i.test(extFromName) && extFromName.length <= 8
      ? extFromName.toLowerCase()
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : file.type === "image/gif"
            ? "gif"
            : "jpg";
  const name = `timetable_${Date.now()}_${randomSuffix()}.${ext}`;
  const path = `rooms/${roomId}/images/${name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "image/jpeg",
  });
  return getDownloadURL(storageRef);
}

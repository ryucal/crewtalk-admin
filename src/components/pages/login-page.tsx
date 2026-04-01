"use client";

import { useState } from "react";
import {
  loginWithPhoneAndPassword,
  getCurrentUserProfile,
  isWebConsoleSuperAdmin,
} from "@/lib/firebase/auth";
import { digitsOnly, formatKrMobileInput, isValidKoreanMobileDigits } from "@/lib/phone-auth";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const digits = digitsOnly(phone);
    if (!digits) {
      setError("전화번호를 입력해 주세요.");
      return;
    }
    if (!isValidKoreanMobileDigits(digits)) {
      setError("전화번호를 올바르게 입력해 주세요.");
      return;
    }
    if (!password) {
      setError("개인 비밀번호를 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      await loginWithPhoneAndPassword(phone, password);
      const profile = await getCurrentUserProfile();
      if (!profile || !isWebConsoleSuperAdmin(profile)) {
        setError(
          "웹 콘솔은 role 이 superAdmin 인 계정만 이용할 수 있습니다.",
        );
        const { signOut } = await import("firebase/auth");
        const { auth } = await import("@/lib/firebase/config");
        await signOut(auth);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "로그인에 실패했습니다.";
      if (message === "auth/invalid-phone") {
        setError("전화번호를 올바르게 입력해 주세요.");
      } else if (message.includes("auth/invalid-credential") || message.includes("auth/wrong-password")) {
        setError("전화번호 또는 개인 비밀번호가 올바르지 않습니다.");
      } else if (message.includes("auth/user-not-found")) {
        setError("등록되지 않은 계정입니다.");
      } else if (message.includes("auth/invalid-email")) {
        setError("전화번호를 올바르게 입력해 주세요.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-[400px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center text-xl font-bold text-white mx-auto mb-4 shadow-lg">
            CT
          </div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
            크루톡 관리자
          </h1>
          <p className="text-sm text-text-tertiary mt-1">
            관리자 콘솔에 로그인하세요
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="text-[11px] font-medium text-text-secondary block mb-1.5">
                전화번호
              </label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(formatKrMobileInput(e.target.value));
                  setError("");
                }}
                placeholder="010-0000-0000"
                className="w-full px-3 py-2.5 border border-border-md rounded-md text-sm outline-none focus:border-accent bg-surface font-sans transition-colors"
              />
            </div>
            <div className="mb-4">
              <label className="text-[11px] font-medium text-text-secondary block mb-1.5">
                개인 비밀번호
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="앱 가입 시 설정한 비밀번호"
                className="w-full px-3 py-2.5 border border-border-md rounded-md text-sm outline-none focus:border-accent bg-surface font-sans transition-colors"
              />
            </div>

            {error && (
              <div className="mb-4 text-xs text-danger bg-danger-light px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-dark transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[11px] text-text-tertiary text-center">
              앱과 동일한 계정입니다. Firebase Auth 는{" "}
              <span className="whitespace-nowrap">010…@crew.co.kr</span> 형식으로 매핑됩니다.               웹은 role 이 superAdmin(대소문자 무관)인 계정만 접근할 수 있습니다.
            </p>
          </div>
        </div>

        <p className="text-[10px] text-text-tertiary text-center mt-6">
          CrewTalk Admin Console v1.0
        </p>
      </div>
    </div>
  );
}

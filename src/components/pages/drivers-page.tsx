"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Edit2, Trash2 } from "lucide-react";
import { getUsersDirectory, getCompanies, updateUserByAdmin, deleteUserDocument } from "@/lib/firebase/firestore";
import { getAvatarTheme } from "@/lib/mock-data";
import type { UserDirectoryRow, User, Company } from "@/lib/types";

type UserRole = User["role"];

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** 010-1234-5678 형태 (최대 11자리) */
function formatKrMobileInput(raw: string): string {
  const d = digitsOnly(raw).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 표시용: 저장값이 하이픈 없어도 포맷 */
function displayPhone(s: string): string {
  const d = digitsOnly(s);
  if (d.length < 10) return s || "—";
  return formatKrMobileInput(d);
}

function normalizeRole(r: string | undefined): UserRole {
  const x = (r || "driver").toLowerCase();
  if (x === "superadmin") return "superAdmin";
  if (x === "manager") return "manager";
  return "driver";
}

/** users.role 표시용 */
function roleLabel(role: UserRole): string {
  if (role === "superAdmin") return "슈퍼관리자";
  if (role === "manager") return "관리자";
  return "기사";
}

const emptyUserForm = () => ({
  name: "",
  phone: "",
  company: "",
  role: "driver" as UserRole,
  car: "",
  driverId: "",
});

type DriversSection = "manage" | "contacts";

export default function DriversPage() {
  const [section, setSection] = useState<DriversSection>("manage");
  const [users, setUsers] = useState<UserDirectoryRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [userForm, setUserForm] = useState(emptyUserForm());
  const [savingUser, setSavingUser] = useState(false);

  const companiesNormal = useMemo(
    () => companies.filter((c) => (c.mode ?? "normal") === "normal"),
    [companies]
  );
  const companiesSolati = useMemo(
    () => companies.filter((c) => c.mode === "summary"),
    [companies]
  );

  useEffect(() => {
    async function loadData() {
      try {
        const [usersData, companiesData] = await Promise.all([getUsersDirectory(), getCompanies()]);
        setUsers(usersData);
        setCompanies(companiesData);
      } catch (error) {
        console.error("Error loading users:", error);
      }
    }
    loadData();
  }, []);

  const defaultCompanyName = useMemo(() => {
    if (companiesNormal[0]) return companiesNormal[0].name;
    if (companiesSolati[0]) return companiesSolati[0].name;
    return "";
  }, [companiesNormal, companiesSolati]);

  useEffect(() => {
    if (!userModalOpen || editingUid !== null || companies.length === 0) return;
    setUserForm((f) => (f.company ? f : { ...f, company: defaultCompanyName }));
  }, [companies.length, userModalOpen, editingUid, defaultCompanyName]);

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.trim();
    if (!q) return true;
    const r = normalizeRole(u.role);
    return (
      u.name.includes(q) ||
      u.company.includes(q) ||
      (u.car || "").includes(q) ||
      displayPhone(u.phone).includes(q) ||
      digitsOnly(u.phone).includes(digitsOnly(q)) ||
      u.displayId.includes(q) ||
      u.driverId.includes(q) ||
      u.uid.includes(q) ||
      roleLabel(r).includes(q)
    );
  });

  const openEditModal = (u: UserDirectoryRow) => {
    setEditingUid(u.uid);
    setUserForm({
      name: u.name || "",
      phone: formatKrMobileInput(digitsOnly(u.phone)),
      company: u.company || "",
      role: normalizeRole(u.role),
      car: u.car || "",
      driverId: u.driverId || "",
    });
    setUserModalOpen(true);
  };

  const closeUserModal = () => {
    setUserModalOpen(false);
    setEditingUid(null);
    setUserForm(emptyUserForm());
  };

  const validatePhone = (formatted: string): boolean => {
    const n = digitsOnly(formatted).length;
    return n >= 10 && n <= 11;
  };

  const handleSaveUser = async () => {
    if (!editingUid) return;
    const name = userForm.name.trim();
    const phone = formatKrMobileInput(digitsOnly(userForm.phone));
    if (!name) {
      alert("이름을 입력해주세요.");
      return;
    }
    if (!validatePhone(phone)) {
      alert("전화번호를 10~11자리(예: 010-1234-5678)로 입력해주세요.");
      return;
    }
    if (!userForm.company.trim()) {
      alert("소속을 선택해주세요.");
      return;
    }

    setSavingUser(true);
    try {
      await updateUserByAdmin(editingUid, {
        name,
        phone,
        company: userForm.company.trim(),
        role: userForm.role,
        car: userForm.car.trim() || undefined,
        driverId: userForm.driverId.trim(),
      });
      setUsers(await getUsersDirectory());
      closeUserModal();
      alert("회원 정보가 수정되었습니다.");
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "";
      alert(msg || "수정에 실패했습니다.");
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (u: UserDirectoryRow) => {
    if (
      !confirm(
        `"${u.name}" 회원의 Firestore 프로필(users/${u.uid})을 삭제할까요?\nFirebase Auth 계정은 콘솔에서 별도 삭제해야 할 수 있습니다.`
      )
    )
      return;
    try {
      await deleteUserDocument(u.uid);
      setUsers(await getUsersDirectory());
      if (editingUid === u.uid) closeUserModal();
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "";
      alert(msg || "삭제에 실패했습니다.");
    }
  };

  const companySelectOptions = (
    <>
      {companies.length === 0 ? (
        <option value="">소속 없음 — 소속 권한에서 먼저 등록</option>
      ) : (
        <>
          {companiesNormal.length > 0 && (
            <optgroup label="일반">
              {companiesNormal.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          {companiesSolati.length > 0 && (
            <optgroup label="솔라티">
              {companiesSolati.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            앱 기사 관리
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            {section === "manage"
              ? "회원 목록은 Firestore users 컬렉션만 표시합니다. 수정·삭제는 users 문서에 반영됩니다."
              : "기사 연락망은 추후 연락처·메모 등을 표시할 예정입니다."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4" role="tablist" aria-label="앱 기사 관리 구역">
        <button
          type="button"
          role="tab"
          aria-selected={section === "manage"}
          onClick={() => setSection("manage")}
          className={`px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors cursor-pointer ${
            section === "manage"
              ? "bg-accent-light border-accent/30 text-accent"
              : "bg-bg border-border-md text-text-secondary hover:bg-surface hover:text-text-primary"
          }`}
        >
          기사 관리
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "contacts"}
          onClick={() => setSection("contacts")}
          className={`px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors cursor-pointer ${
            section === "contacts"
              ? "bg-accent-light border-accent/30 text-accent"
              : "bg-bg border-border-md text-text-secondary hover:bg-surface hover:text-text-primary"
          }`}
        >
          기사 연락망
        </button>
      </div>

      {section === "contacts" ? (
        <div className="bg-surface border border-border rounded-[10px] p-12 shadow-sm text-center">
          <p className="text-sm text-text-secondary">기사 연락망 화면은 준비 중입니다.</p>
          <p className="text-xs text-text-tertiary mt-2">추가 기능이 연결되면 이 영역에 표시됩니다.</p>
        </div>
      ) : (
      <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
        <div className="relative mb-3.5">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            placeholder="이름, 전화번호, 차량번호, 소속, 역할, driverId·UID 검색…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-border-md rounded-md font-sans text-[13px] text-text-primary outline-none focus:border-accent bg-surface"
          />
        </div>

        <table className="w-full border-collapse">
            <thead>
              <tr>
                {["이름", "전화번호", "소속", "역할", "관리"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wide border-b border-border bg-bg"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-xs text-text-tertiary">
                    {users.length === 0
                      ? "users 컬렉션에 등록된 회원이 없습니다."
                      : "검색 조건에 맞는 회원이 없습니다."}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const theme = getAvatarTheme(u.name);
                  const r = normalizeRole(u.role);
                  const roleStyle =
                    r === "manager"
                      ? "bg-blue-light text-blue"
                      : r === "superAdmin"
                        ? "bg-accent-light text-accent"
                        : "bg-gray-100 text-text-secondary";

                  return (
                    <tr key={u.uid} className="hover:bg-bg transition-colors">
                      <td className="px-3 py-2.5 text-xs border-b border-border">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold"
                            style={{ background: theme.bg, color: theme.fg }}
                          >
                            {(u.name || "?").charAt(0)}
                          </div>
                          <span className="font-medium">{u.name || "—"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs border-b border-border text-text-secondary whitespace-nowrap tabular-nums">
                        {displayPhone(u.phone)}
                      </td>
                      <td
                        className="px-3 py-2.5 text-xs border-b border-border text-text-secondary max-w-[200px] truncate"
                        title={u.company || undefined}
                      >
                        {u.company || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs border-b border-border">
                        <span className={`text-[10px] font-medium px-[7px] py-[2px] rounded ${roleStyle}`}>
                          {roleLabel(r)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs border-b border-border">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="text-accent hover:opacity-70 transition-opacity cursor-pointer p-0.5"
                            title="수정"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="text-text-tertiary hover:text-danger transition-colors cursor-pointer p-0.5"
                            title="삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
      </div>
      )}

      {userModalOpen && editingUid && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl p-6 w-full max-w-[480px] shadow-lg animate-fade-in max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-text-primary mb-4">회원 정보 수정</h2>
            <p className="text-[11px] text-text-tertiary mb-3">
              문서 ID(uid): <span className="font-mono text-text-secondary">{editingUid}</span>
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-text-secondary block mb-1">이름</label>
                  <input
                    type="text"
                    value={userForm.name}
                    onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="홍길동"
                    className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                    전화번호
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={userForm.phone}
                    onChange={(e) =>
                      setUserForm((f) => ({ ...f, phone: formatKrMobileInput(e.target.value) }))
                    }
                    placeholder="010-1234-5678"
                    className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-text-secondary block mb-1">소속</label>
                  <select
                    value={userForm.company}
                    onChange={(e) => setUserForm((f) => ({ ...f, company: e.target.value }))}
                    className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent bg-surface"
                  >
                    {companySelectOptions}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-text-secondary block mb-1">역할</label>
                  <select
                    value={userForm.role}
                    onChange={(e) =>
                      setUserForm((f) => ({ ...f, role: e.target.value as UserRole }))
                    }
                    className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent bg-surface"
                  >
                    <option value="driver">driver (기사)</option>
                    <option value="manager">manager (관리)</option>
                    <option value="superAdmin">superAdmin (앱 상위 권한)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  기사/연동 ID (driverId)
                </label>
                <input
                  type="text"
                  value={userForm.driverId}
                  onChange={(e) => setUserForm((f) => ({ ...f, driverId: e.target.value }))}
                  placeholder="앱·기사 문서와 연결되는 ID"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent font-mono text-[12px]"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">차량번호</label>
                <input
                  type="text"
                  value={userForm.car}
                  onChange={(e) => setUserForm((f) => ({ ...f, car: e.target.value }))}
                  placeholder="경기 78사 2918호"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={closeUserModal}
                disabled={savingUser}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-border-md bg-surface text-text-secondary hover:bg-bg cursor-pointer disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveUser}
                disabled={savingUser || companies.length === 0}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-accent bg-accent text-white hover:bg-accent-dark cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingUser ? "처리 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

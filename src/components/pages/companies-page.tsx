"use client";

import { useState, useEffect } from "react";
import { Plus, Eye, EyeOff, Edit2, Trash2 } from "lucide-react";
import { getCompanies, getDrivers, updateCompanies, updateDriversCompany } from "@/lib/firebase/firestore";
import type { Company, Driver } from "@/lib/types";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<Company>({ name: "", password: "", mode: "normal" });
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editForm, setEditForm] = useState<Company>({ name: "", password: "", mode: "normal" });

  useEffect(() => {
    async function loadData() {
      try {
        const [companiesData, driversData] = await Promise.all([
          getCompanies(),
          getDrivers(),
        ]);
        setCompanies(companiesData);
        setDrivers(driversData);
      } catch (error) {
        console.error("Error loading companies:", error);
      }
    }
    loadData();
  }, []);

  const companyStats = companies.map((c) => ({
    ...c,
    driverCount: drivers.filter((d) => d.company === c.name).length,
  }));

  const maxCount = Math.max(...companyStats.map((c) => c.driverCount));

  const togglePassword = (name: string) => {
    setShowPasswords((p) => ({ ...p, [name]: !p[name] }));
  };

  const handleEditClick = (c: Company) => {
    setEditingCompany(c);
    setEditForm({ name: c.name, password: c.password, mode: c.mode || "normal" });
  };

  const handleSaveEdit = async () => {
    if (!editingCompany) return;
    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      alert("소속명을 입력해주세요.");
      return;
    }
    const nameChanged = trimmedName !== editingCompany.name;
    const nameExists = companies.some((x) => x.name === trimmedName && x.name !== editingCompany.name);
    if (nameExists) {
      alert("이미 존재하는 소속명입니다.");
      return;
    }

    try {
      let updated = companies.map((c) =>
        c.name === editingCompany.name
          ? { ...editForm, name: trimmedName, mode: editForm.mode || "normal" }
          : c
      );
      if (nameChanged) {
        await updateDriversCompany(editingCompany.name, trimmedName);
        const freshDrivers = await getDrivers();
        setDrivers(freshDrivers);
      }
      await updateCompanies(updated);
      setCompanies(updated);
      setEditingCompany(null);
    } catch (error) {
      console.error("Error updating company:", error);
      alert("소속 수정에 실패했습니다.");
    }
  };

  const handleAddCompany = async () => {
    const trimmedName = addForm.name.trim();
    if (!trimmedName) {
      alert("소속명을 입력해주세요.");
      return;
    }
    if (companies.some((c) => c.name === trimmedName)) {
      alert("이미 존재하는 소속명입니다.");
      return;
    }
    if (!addForm.password.trim()) {
      alert("비밀번호를 입력해주세요.");
      return;
    }

    try {
      const newCompany: Company = {
        name: trimmedName,
        password: addForm.password.trim(),
        mode: addForm.mode || "normal",
      };
      const updated = [...companies, newCompany];
      await updateCompanies(updated);
      setCompanies(updated);
      setShowAddModal(false);
      setAddForm({ name: "", password: "", mode: "normal" });
    } catch (error: unknown) {
      console.error("Error adding company:", error);
      const err = error as { code?: string; message?: string };
      const msg =
        err?.code === "permission-denied"
          ? "권한이 없습니다. superAdmin으로 로그인했는지 확인하세요. Firestore 규칙이 crewtalk8에 배포되었는지도 확인하세요."
          : err?.message || "소속 추가에 실패했습니다.";
      alert(msg);
    }
  };

  const handleDeleteCompany = async (companyName: string) => {
    const driverCount = drivers.filter((d) => d.company === companyName).length;
    if (driverCount > 0) {
      if (!confirm(`"${companyName}"에 등록된 기사가 ${driverCount}명 있습니다. 삭제하면 해당 기사들의 소속 정보가 초기화될 수 있습니다. 계속하시겠습니까?`)) {
        return;
      }
    } else {
      if (!confirm(`"${companyName}" 소속을 삭제하시겠습니까?`)) {
        return;
      }
    }

    try {
      const updatedCompanies = companies.filter((c) => c.name !== companyName);
      await updateCompanies(updatedCompanies);
      setCompanies(updatedCompanies);
    } catch (error) {
      console.error("Error deleting company:", error);
      alert("소속 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            소속·권한 관리
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            소속 추가·삭제, 비밀번호 설정
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-medium cursor-pointer border border-accent bg-accent text-white transition-colors hover:bg-accent-dark"
        >
          <Plus size={12} />
          소속 추가
        </button>
      </div>

      {/* Company Cards */}
      <div className="grid grid-cols-4 gap-3 mb-[18px]">
        {companyStats.map((c) => {
          const colors = [
            "var(--color-accent)",
            "var(--color-blue)",
            "var(--color-warning)",
            "#9ca3af",
          ];
          const idx = companyStats.indexOf(c);
          return (
            <div
              key={c.name}
              className="bg-surface border border-border rounded-[10px] p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">
                  {c.name}
                </span>
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: colors[idx % colors.length] }}
                />
              </div>
              <div className="text-[22px] font-semibold leading-none tracking-tight mb-1.5">
                {c.driverCount}
              </div>
              <div className="text-[11px] text-text-tertiary flex items-center gap-1">
                등록 기사
                <span className="text-[10px] px-1.5 py-px rounded-full font-medium bg-gray-100 text-text-secondary">
                  {c.mode === "summary" ? "통합" : "일반"}
                </span>
              </div>
              <div className="mt-3 h-[5px] bg-bg rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full animate-bar-grow"
                  style={{
                    width: `${(c.driverCount / maxCount) * 100}%`,
                    background: colors[idx % colors.length],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["소속명", "기사 수", "비밀번호", "모드", "관리"].map((h) => (
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
            {companyStats.map((c) => (
              <tr key={c.name} className="hover:bg-bg transition-colors">
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  <strong>{c.name}</strong>
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  {c.driverCount}명
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="font-mono tracking-wider">
                      {showPasswords[c.name] ? c.password : "••••••"}
                    </span>
                    <button
                      onClick={() => togglePassword(c.name)}
                      className="text-text-tertiary hover:text-text-primary cursor-pointer transition-colors"
                    >
                      {showPasswords[c.name] ? (
                        <EyeOff size={13} />
                      ) : (
                        <Eye size={13} />
                      )}
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  <span
                    className={`text-[10px] font-medium px-[7px] py-[2px] rounded ${
                      c.mode === "summary"
                        ? "bg-blue-light text-blue"
                        : "bg-accent-light text-accent"
                    }`}
                  >
                    {c.mode || "normal"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditClick(c)}
                      className="text-accent hover:opacity-70 transition-opacity cursor-pointer"
                      title="소속 수정"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteCompany(c.name)}
                      className="text-text-tertiary hover:text-danger transition-colors cursor-pointer"
                      title="소속 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingCompany && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-[420px] shadow-lg animate-fade-in">
            <h2 className="text-base font-semibold text-text-primary mb-4">
              소속 수정
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  소속명
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="업체명 입력"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  비밀번호
                </label>
                <input
                  type="text"
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="로그인 비밀번호"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  보고 모드
                </label>
                <select
                  value={editForm.mode || "normal"}
                  onChange={(e) => setEditForm((f) => ({ ...f, mode: e.target.value as "normal" | "summary" }))}
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent bg-surface"
                >
                  <option value="normal">일반 (normal)</option>
                  <option value="summary">출퇴근 통합 (summary)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditingCompany(null)}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-border-md bg-surface text-text-secondary hover:bg-bg cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-accent bg-accent text-white hover:bg-accent-dark cursor-pointer"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-[420px] shadow-lg animate-fade-in">
            <h2 className="text-base font-semibold text-text-primary mb-4">
              새 소속 추가
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  소속명
                </label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="업체명 입력"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  비밀번호
                </label>
                <input
                  type="text"
                  value={addForm.password}
                  onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="로그인 비밀번호"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  보고 모드
                </label>
                <select
                  value={addForm.mode || "normal"}
                  onChange={(e) => setAddForm((f) => ({ ...f, mode: e.target.value as "normal" | "summary" }))}
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent bg-surface"
                >
                  <option value="normal">일반 (normal)</option>
                  <option value="summary">출퇴근 통합 (summary)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setAddForm({ name: "", password: "", mode: "normal" });
                }}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-border-md bg-surface text-text-secondary hover:bg-bg cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleAddCompany}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-accent bg-accent text-white hover:bg-accent-dark cursor-pointer"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

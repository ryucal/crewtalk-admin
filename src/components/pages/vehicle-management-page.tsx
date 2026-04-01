"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Edit2, Trash2, Plus, FileSpreadsheet, ChevronUp, ChevronDown } from "lucide-react";
import { getVehicleRegistry, updateVehicleRegistryItems, getCompanies } from "@/lib/firebase/firestore";
import type { VehicleRegistryItem, Company } from "@/lib/types";
import vehicleRegistrySeed from "@/data/vehicle-registry-seed.json";
import {
  sortVehicleRegistryForTable,
  moveVehicleInCompany,
  maxOrderInCompanyIfManual,
  afterVehicleDelete,
  compactVehicleOrdersInCompany,
  vehicleCompanyTableRowClass,
} from "@/lib/vehicle-registry-sort";

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function formatKrMobileInput(raw: string): string {
  const d = digitsOnly(raw).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function displayPhone(s: string): string {
  const t = s.trim();
  if (!t) return "—";
  if (t.includes("/")) return t;
  const d = digitsOnly(t);
  if (d.length < 10) return t;
  return formatKrMobileInput(d);
}

function normalizePhoneForSave(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("/")) {
    return t
      .split("/")
      .map((p) => formatKrMobileInput(digitsOnly(p.trim())))
      .join(" / ");
  }
  return formatKrMobileInput(digitsOnly(t));
}

const emptyForm = () => ({
  company: "",
  carNumber: "",
  driverName: "",
  phone: "",
  note: "",
});

export default function VehicleManagementPage() {
  const [items, setItems] = useState<VehicleRegistryItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  /** null 이면 신규 등록 */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const companyNames = useMemo(() => new Set(companies.map((c) => c.name)), [companies]);

  const companiesNormal = useMemo(
    () => companies.filter((c) => (c.mode ?? "normal") === "normal"),
    [companies]
  );
  const companiesSolati = useMemo(
    () => companies.filter((c) => c.mode === "summary"),
    [companies]
  );

  const defaultCompanyName = useMemo(() => {
    if (companiesNormal[0]) return companiesNormal[0].name;
    if (companiesSolati[0]) return companiesSolati[0].name;
    return "";
  }, [companiesNormal, companiesSolati]);

  async function refresh() {
    const [registry, comps] = await Promise.all([getVehicleRegistry(), getCompanies()]);
    setItems(registry);
    setCompanies(comps);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refresh();
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!modalOpen || editingId !== null || companies.length === 0) return;
    setForm((f) => (f.company ? f : { ...f, company: defaultCompanyName }));
  }, [companies.length, modalOpen, editingId, defaultCompanyName]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim();
    const ql = q.toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      return (
        it.company.toLowerCase().includes(ql) ||
        it.carNumber.toLowerCase().includes(ql) ||
        it.driverName.toLowerCase().includes(ql) ||
        displayPhone(it.phone).includes(q) ||
        digitsOnly(it.phone).includes(digitsOnly(q)) ||
        (it.note || "").toLowerCase().includes(ql)
      );
    });
  }, [items, searchQuery]);

  const sortedRows = useMemo(() => sortVehicleRegistryForTable(filtered), [filtered]);

  const openNewModal = () => {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      company: defaultCompanyName || "",
    });
    setModalOpen(true);
  };

  const openEditModal = (it: VehicleRegistryItem) => {
    setEditingId(it.id);
    const phoneDisplay =
      it.phone.trim() === ""
        ? ""
        : it.phone.includes("/")
          ? it.phone
              .split("/")
              .map((p) => formatKrMobileInput(digitsOnly(p.trim())))
              .join(" / ")
          : formatKrMobileInput(digitsOnly(it.phone));
    setForm({
      company: it.company || "",
      carNumber: it.carNumber || "",
      driverName: it.driverName || "",
      phone: phoneDisplay,
      note: it.note || "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const validatePhone = (formatted: string): boolean => {
    const t = formatted.trim();
    if (!t) return true;
    if (t.includes("/")) {
      return t.split("/").every((part) => {
        const n = digitsOnly(part).length;
        return n === 0 || (n >= 10 && n <= 11);
      });
    }
    const n = digitsOnly(t).length;
    return n === 0 || (n >= 10 && n <= 11);
  };

  const persist = async (next: VehicleRegistryItem[]) => {
    await updateVehicleRegistryItems(next);
    setItems(next);
  };

  const handleSave = async () => {
    const company = form.company.trim();
    const carNumber = form.carNumber.trim();
    const driverName = form.driverName.trim();
    const phone = normalizePhoneForSave(form.phone);
    const note = form.note.trim();

    if (!company) {
      alert("회사명(소속)을 선택하거나 입력해 주세요.");
      return;
    }
    if (!carNumber) {
      alert("차량번호를 입력해 주세요.");
      return;
    }
    if (!validatePhone(phone)) {
      alert("전화번호는 비우거나 10~11자리로 입력해 주세요.");
      return;
    }

    const baseId =
      editingId ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}`);
    const prevRow = editingId ? items.find((x) => x.id === editingId) : undefined;
    const row: VehicleRegistryItem = {
      id: baseId,
      company,
      carNumber,
      driverName,
      phone,
      ...(note ? { note } : {}),
    };
    if (editingId && prevRow) {
      if (
        prevRow.company.trim() === company &&
        typeof prevRow.orderInCompany === "number" &&
        Number.isFinite(prevRow.orderInCompany)
      ) {
        row.orderInCompany = prevRow.orderInCompany;
      }
    } else if (!editingId) {
      const tail = maxOrderInCompanyIfManual(items, company);
      if (tail >= 0) row.orderInCompany = tail + 1;
    }

    setSaving(true);
    try {
      let next: VehicleRegistryItem[];
      if (editingId) {
        next = items.map((x) => (x.id === editingId ? row : x));
        if (prevRow && prevRow.company.trim() !== company.trim()) {
          next = compactVehicleOrdersInCompany(next, prevRow.company.trim());
        }
      } else {
        next = [...items, row];
      }
      await persist(next);
      closeModal();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleImportSeed = async () => {
    const seed = vehicleRegistrySeed;
    const existingIds = new Set(items.map((x) => x.id));
    const toAdd = seed.filter((s) => !existingIds.has(s.id));
    if (toAdd.length === 0) {
      alert("추가할 CSV 시드가 없습니다. (이미 반영됐거나 동일 ID만 있습니다.)");
      return;
    }
    if (
      !confirm(
        `데스크톱 CSV 기준 ${toAdd.length}건을 Firestore에 추가할까요?\n기존 ${items.length}건은 유지됩니다.`
      )
    )
      return;
    setSaving(true);
    try {
      await persist([...items, ...toAdd]);
      alert(`${toAdd.length}건을 추가했습니다.`);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "가져오기에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleMoveInCompany = async (id: string, dir: "up" | "down") => {
    const next = moveVehicleInCompany(items, id, dir);
    if (next === items) return;
    setSaving(true);
    try {
      await persist(next);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "순서 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (it: VehicleRegistryItem) => {
    if (!confirm(`차량 "${it.carNumber}" 항목을 삭제할까요?`)) return;
    try {
      const co = it.company.trim();
      const next = afterVehicleDelete(
        items.filter((x) => x.id !== it.id),
        co
      );
      await persist(next);
      if (editingId === it.id) closeModal();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "삭제에 실패했습니다.");
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">차량 관리</h1>
          <p className="text-xs text-text-tertiary mt-1">차량관리 data 는 별도로 저장 관리 됩니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleImportSeed()}
            disabled={loading || saving}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium border border-border-md bg-surface text-text-secondary hover:bg-bg cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet size={14} />
            CSV 시드 불러오기
          </button>
          <button
            type="button"
            onClick={openNewModal}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium border border-accent bg-accent text-white hover:bg-accent-dark cursor-pointer disabled:opacity-50"
          >
            <Plus size={14} />
            차량 등록
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
        <div className="relative mb-3.5">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            placeholder="차량번호, 회사명, 성명, 전화번호, 비고 검색…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-border-md rounded-md font-sans text-[13px] text-text-primary outline-none focus:border-accent bg-surface"
          />
        </div>

        {loading ? (
          <p className="text-sm text-text-tertiary py-10 text-center">불러오는 중…</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {(
                  [
                    ["순번", "w-12 text-center"],
                    ["회사명", ""],
                    ["차량번호", ""],
                    ["성명(운전자)", ""],
                    ["전화번호", ""],
                    ["비고", ""],
                    ["관리 (순서·수정·삭제)", "w-[132px]"],
                  ] as const
                ).map(([h, cls]) => (
                  <th
                    key={h}
                    className={`text-left px-3 py-2.5 text-[13px] font-semibold text-text-tertiary border-b border-border bg-bg ${cls}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-[14px] text-text-tertiary">
                    {items.length === 0
                      ? "등록된 차량이 없습니다. 우측 상단에서 차량을 등록하세요."
                      : "검색 조건에 맞는 항목이 없습니다."}
                  </td>
                </tr>
              ) : (
                sortedRows.map((it, idx) => (
                  <tr key={it.id} className={vehicleCompanyTableRowClass(it.company)}>
                    <td className="px-3 py-2.5 text-[14px] border-b border-border text-center text-text-secondary tabular-nums">
                      {idx + 1}
                    </td>
                    <td
                      className="px-3 py-2.5 text-[14px] border-b border-border text-text-secondary max-w-[140px] truncate"
                      title={it.company || undefined}
                    >
                      {it.company || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[14px] border-b border-border font-medium text-text-primary whitespace-nowrap">
                      {it.carNumber || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[14px] border-b border-border font-medium">
                      {it.driverName || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[14px] border-b border-border text-text-secondary whitespace-nowrap tabular-nums">
                      {displayPhone(it.phone)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-[14px] border-b border-border text-text-secondary max-w-[200px] truncate"
                      title={it.note || undefined}
                    >
                      {it.note?.trim() || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[14px] border-b border-border">
                      <div className="flex items-center gap-0.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => void handleMoveInCompany(it.id, "up")}
                          disabled={saving}
                          className="text-text-tertiary hover:text-accent transition-colors cursor-pointer p-0.5 disabled:opacity-40"
                          title="같은 소속 안에서 위로 (전체 목록 기준)"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMoveInCompany(it.id, "down")}
                          disabled={saving}
                          className="text-text-tertiary hover:text-accent transition-colors cursor-pointer p-0.5 disabled:opacity-40"
                          title="같은 소속 안에서 아래로 (전체 목록 기준)"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(it)}
                          className="text-accent hover:opacity-70 transition-opacity cursor-pointer p-0.5"
                          title="수정"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(it)}
                          className="text-text-tertiary hover:text-danger transition-colors cursor-pointer p-0.5"
                          title="삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl p-6 w-full max-w-[480px] shadow-lg animate-fade-in max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-text-primary mb-4">
              {editingId ? "차량 정보 수정" : "차량 등록"}
            </h2>
            {editingId && (
              <p className="text-[11px] text-text-tertiary mb-3">
                ID: <span className="font-mono text-text-secondary">{editingId}</span>
              </p>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">회사명(소속)</label>
                <select
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent bg-surface"
                >
                  {form.company && !companyNames.has(form.company) ? (
                    <option value={form.company}>{form.company} (목록에 없음)</option>
                  ) : null}
                  {companySelectOptions}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">차량번호</label>
                <input
                  type="text"
                  value={form.carNumber}
                  onChange={(e) => setForm((f) => ({ ...f, carNumber: e.target.value }))}
                  placeholder="경기 78사 2918호"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">성명(운전자)</label>
                <input
                  type="text"
                  value={form.driverName}
                  onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))}
                  placeholder="홍길동"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">전화번호</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: formatKrMobileInput(e.target.value) }))
                  }
                  placeholder="010-1234-5678 (선택)"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent tabular-nums"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">비고</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="차량·운행 메모"
                  rows={2}
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent resize-y min-h-[52px]"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-border-md bg-surface text-text-secondary hover:bg-bg cursor-pointer disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || companies.length === 0}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-accent bg-accent text-white hover:bg-accent-dark cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "처리 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

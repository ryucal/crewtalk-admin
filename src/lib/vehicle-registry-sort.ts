import type { VehicleRegistryItem } from "@/lib/types";

/** 테이블에서 회사(소속) 먼저 묶을 때의 표시 순서 */
export const VEHICLE_TABLE_COMPANY_ORDER = [
  "크루버스",
  "더크루버스",
  "가자고",
  "아주고속",
  "케이오림",
  "송호관광",
  "강남",
  "가고파",
] as const;

export function compareVehicleTableCompany(a: string, b: string): number {
  const ta = a.trim();
  const tb = b.trim();
  const ia = (VEHICLE_TABLE_COMPANY_ORDER as readonly string[]).indexOf(ta);
  const ib = (VEHICLE_TABLE_COMPANY_ORDER as readonly string[]).indexOf(tb);
  const inA = ia >= 0;
  const inB = ib >= 0;
  if (inA && inB) return ia - ib;
  if (inA) return -1;
  if (inB) return 1;
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  return ta.localeCompare(tb, "ko");
}

function sortWithinCompanyLegacy(a: VehicleRegistryItem, b: VehicleRegistryItem): number {
  const ca = a.carNumber.trim();
  const cb = b.carNumber.trim();
  if (ca !== cb) return ca.localeCompare(cb, "ko");
  return a.driverName.localeCompare(b.driverName, "ko");
}

function companyUsesManualOrder(group: VehicleRegistryItem[]): boolean {
  return (
    group.length > 0 &&
    group.every((x) => typeof x.orderInCompany === "number" && Number.isFinite(x.orderInCompany))
  );
}

/** 같은 소속 안에서만 적용되는 표시 순서 */
export function sortCompanyGroupForDisplay(group: VehicleRegistryItem[]): VehicleRegistryItem[] {
  const g = [...group];
  if (companyUsesManualOrder(g)) {
    g.sort((a, b) => (a.orderInCompany! - b.orderInCompany!) || a.id.localeCompare(b.id));
  } else {
    g.sort(sortWithinCompanyLegacy);
  }
  return g;
}

/**
 * 소속별로 회사 순 → 소속 내 순서로 평탄화 (필터된 부분 목록에도 동일 규칙 적용)
 */
export function sortVehicleRegistryForTable(items: VehicleRegistryItem[]): VehicleRegistryItem[] {
  const groups = new Map<string, VehicleRegistryItem[]>();
  for (const it of items) {
    const k = it.company.trim();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  const orderedKeys = [...groups.keys()].sort((ka, kb) => compareVehicleTableCompany(ka, kb));
  const flat: VehicleRegistryItem[] = [];
  for (const k of orderedKeys) {
    flat.push(...sortCompanyGroupForDisplay(groups.get(k)!));
  }
  return flat;
}

/**
 * 같은 소속 안에서 한 칸 위·아래. 처음 조작 시 해당 소속 전체에 orderInCompany(0…)를 부여합니다.
 */
export function moveVehicleInCompany(
  items: VehicleRegistryItem[],
  id: string,
  dir: "up" | "down"
): VehicleRegistryItem[] {
  const target = items.find((x) => x.id === id);
  if (!target) return items;
  const c = target.company.trim();
  const sameCo = items.filter((x) => x.company.trim() === c);
  const sorted = sortCompanyGroupForDisplay(sameCo);
  const idx = sorted.findIndex((x) => x.id === id);
  if (idx < 0) return items;
  const j = dir === "up" ? idx - 1 : idx + 1;
  if (j < 0 || j >= sorted.length) return items;
  const reordered = [...sorted];
  [reordered[idx], reordered[j]] = [reordered[j], reordered[idx]];
  const withOrders = reordered.map((row, i) => ({
    ...row,
    orderInCompany: i,
  }));
  const idToRow = new Map(withOrders.map((r) => [r.id, r]));
  return items.map((row) => (row.company.trim() === c ? (idToRow.get(row.id) ?? row) : row));
}

/** 해당 소속이 수동 순서 모드이면 마지막 index, 아니면 -1 */
export function maxOrderInCompanyIfManual(items: VehicleRegistryItem[], companyTrimmed: string): number {
  const g = items.filter((x) => x.company.trim() === companyTrimmed);
  if (!companyUsesManualOrder(g)) return -1;
  return Math.max(...g.map((x) => x.orderInCompany!), -1);
}

function compactCompanyOrders(items: VehicleRegistryItem[], companyKey: string): VehicleRegistryItem[] {
  const g = items.filter((x) => x.company.trim() === companyKey);
  if (!companyUsesManualOrder(g)) return items;
  const sorted = sortCompanyGroupForDisplay(g);
  const idToNew = new Map(sorted.map((r, i) => [r.id, i]));
  return items.map((row) =>
    row.company.trim() === companyKey ? { ...row, orderInCompany: idToNew.get(row.id)! } : row
  );
}

/** 삭제 후 같은 소속의 orderInCompany 를 0…n-1 으로 다시 맞춤 */
export function afterVehicleDelete(items: VehicleRegistryItem[], deletedCompanyTrimmed: string): VehicleRegistryItem[] {
  return compactCompanyOrders(items, deletedCompanyTrimmed);
}

/** 항목이 다른 소속으로 옮겨진 뒤, 비운 소속의 순번을 0…n-1 로 정리 */
export function compactVehicleOrdersInCompany(items: VehicleRegistryItem[], companyTrimmed: string): VehicleRegistryItem[] {
  return compactCompanyOrders(items, companyTrimmed);
}

/** 차량 관리 테이블 행 — 소속별 배경·호버 (Tailwind 클래스 문자열) */
const VEHICLE_ROW_TONE_BY_ORDER: readonly string[] = [
  "bg-sky-50/90 hover:bg-sky-100/75",
  "bg-violet-50/90 hover:bg-violet-100/75",
  "bg-emerald-50/90 hover:bg-emerald-100/75",
  "bg-amber-50/90 hover:bg-amber-100/75",
  "bg-rose-50/90 hover:bg-rose-100/75",
  "bg-cyan-50/90 hover:bg-cyan-100/75",
  "bg-indigo-50/90 hover:bg-indigo-100/75",
  "bg-lime-50/90 hover:bg-lime-100/75",
];

const VEHICLE_ROW_TONE_FALLBACK: readonly string[] = [
  "bg-orange-50/90 hover:bg-orange-100/75",
  "bg-fuchsia-50/90 hover:bg-fuchsia-100/75",
  "bg-teal-50/90 hover:bg-teal-100/75",
  "bg-stone-100/85 hover:bg-stone-200/65",
];

function hashCompanyKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function vehicleCompanyTableRowClass(company: string): string {
  const k = company.trim();
  if (!k) return "bg-zinc-100/80 hover:bg-zinc-200/60 transition-colors";
  const order = VEHICLE_TABLE_COMPANY_ORDER as readonly string[];
  const idx = order.indexOf(k);
  if (idx >= 0) return `${VEHICLE_ROW_TONE_BY_ORDER[idx]} transition-colors`;
  const fi = hashCompanyKey(k) % VEHICLE_ROW_TONE_FALLBACK.length;
  return `${VEHICLE_ROW_TONE_FALLBACK[fi]} transition-colors`;
}

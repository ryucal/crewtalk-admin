/**
 * data/vehicles-source.csv → src/data/vehicle-registry-seed.json
 * 실행: node scripts/generate-vehicle-seed.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      result.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  result.push(cur);
  return result.map((s) => s.trim());
}

const csvPath = path.join(root, "data", "vehicles-source.csv");
const outPath = path.join(root, "src", "data", "vehicle-registry-seed.json");

const raw = fs.readFileSync(csvPath, "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.trim());

const items = [];
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  if (cols.length < 3) continue;
  const company = cols[1] ?? "";
  const carNumber = (cols[2] ?? "").trim();
  if (!carNumber) continue;
  let driverName = cols[3] ?? "";
  let phone = cols[4] ?? "";
  const note = cols[5] ?? "";
  if (driverName === "-") driverName = "";
  if (phone === "-") phone = "";
  const row = {
    id: `seed-csv-${String(i).padStart(4, "0")}`,
    company,
    carNumber,
    driverName,
    phone,
  };
  if (note && note !== "-") row.note = note;
  items.push(row);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(items, null, 2), "utf8");
console.log(`Wrote ${items.length} rows → ${path.relative(root, outPath)}`);

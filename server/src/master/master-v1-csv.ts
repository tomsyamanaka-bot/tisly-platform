import type { MasterV1Entity } from "./master-v1-types.js";
import {
  createMasterV1Customer,
  createMasterV1Material,
  createMasterV1Rank,
  createMasterV1WorkItem,
  listMasterV1CustomerPrices,
  listMasterV1Customers,
  listMasterV1Materials,
  listMasterV1Ranks,
  listMasterV1SymbolMappings,
  listMasterV1WorkItems,
} from "./master-v1-store.js";

function escapeCsv(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map(parseCsvLine);
}

function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

export function exportMasterV1Csv(entity: MasterV1Entity): string {
  switch (entity) {
    case "customers":
      return rowsToCsv(
        ["customerCode", "name", "rankId", "contactName", "phone", "email", "address", "memo", "favorite", "active"],
        listMasterV1Customers({ activeOnly: false }).map((c) => [
          c.customerCode,
          c.name,
          c.rankId ?? "",
          c.contactName ?? "",
          c.phone ?? "",
          c.email ?? "",
          c.address ?? "",
          c.memo ?? "",
          c.favorite ? 1 : 0,
          c.active ? 1 : 0,
        ])
      );
    case "ranks":
      return rowsToCsv(
        ["name", "costMultiplier", "laborMultiplier", "memo", "sortOrder", "active"],
        listMasterV1Ranks({ activeOnly: false }).map((r) => [
          r.name,
          r.costMultiplier,
          r.laborMultiplier,
          r.memo ?? "",
          r.sortOrder,
          r.active ? 1 : 0,
        ])
      );
    case "work-items":
      return rowsToCsv(
        ["category", "code", "name", "unit", "standardCost", "laborCost", "memo", "favorite", "active"],
        listMasterV1WorkItems({ activeOnly: false }).map((w) => [
          w.category,
          w.code,
          w.name,
          w.unit,
          w.standardCost,
          w.laborCost,
          w.memo ?? "",
          w.favorite ? 1 : 0,
          w.active ? 1 : 0,
        ])
      );
    case "materials":
      return rowsToCsv(
        ["category", "code", "name", "maker", "model", "unit", "cost", "memo", "favorite", "active"],
        listMasterV1Materials({ activeOnly: false }).map((m) => [
          m.category,
          m.code,
          m.name,
          m.maker ?? "",
          m.model ?? "",
          m.unit,
          m.cost,
          m.memo ?? "",
          m.favorite ? 1 : 0,
          m.active ? 1 : 0,
        ])
      );
    case "customer-prices":
      return rowsToCsv(
        ["customerId", "itemType", "itemId", "unitPrice", "costPrice", "memo"],
        listMasterV1CustomerPrices().map((p) => [
          p.customerId,
          p.itemType,
          p.itemId,
          p.unitPrice,
          p.costPrice,
          p.memo ?? "",
        ])
      );
    case "symbol-mappings":
      return rowsToCsv(
        ["mappingKind", "symbolType", "label", "workItemId", "materialId", "qtyPerUnit", "memo", "active"],
        listMasterV1SymbolMappings({ activeOnly: false }).map((m) => [
          m.mappingKind,
          m.symbolType,
          m.label,
          m.workItemId ?? "",
          m.materialId ?? "",
          m.qtyPerUnit,
          m.memo ?? "",
          m.active ? 1 : 0,
        ])
      );
    default:
      return "";
  }
}

export interface MasterV1CsvImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export function importMasterV1Csv(entity: MasterV1Entity, csvText: string): MasterV1CsvImportResult {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return { imported: 0, skipped: 0, errors: ["ヘッダー行とデータ行が必要です"] };
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);
  const result: MasterV1CsvImportResult = { imported: 0, skipped: 0, errors: [] };

  const col = (row: string[], name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? row[idx]?.trim() ?? "" : "";
  };

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    try {
      switch (entity) {
        case "customers": {
          const name = col(row, "name");
          if (!name) {
            result.skipped++;
            continue;
          }
          createMasterV1Customer({
            customerCode: col(row, "customerCode") || undefined,
            name,
            rankId: col(row, "rankId") || null,
            contactName: col(row, "contactName") || null,
            phone: col(row, "phone") || null,
            email: col(row, "email") || null,
            address: col(row, "address") || null,
            memo: col(row, "memo") || null,
            favorite: col(row, "favorite") === "1",
            active: col(row, "active") !== "0",
          });
          result.imported++;
          break;
        }
        case "ranks": {
          const name = col(row, "name");
          if (!name) {
            result.skipped++;
            continue;
          }
          createMasterV1Rank({
            name,
            costMultiplier: Number(col(row, "costMultiplier")) || 2,
            laborMultiplier: Number(col(row, "laborMultiplier")) || 2,
            memo: col(row, "memo") || null,
            sortOrder: Number(col(row, "sortOrder")) || 0,
            active: col(row, "active") !== "0",
          });
          result.imported++;
          break;
        }
        case "work-items": {
          const name = col(row, "name");
          const category = col(row, "category") || "その他";
          if (!name) {
            result.skipped++;
            continue;
          }
          createMasterV1WorkItem({
            category,
            code: col(row, "code") || undefined,
            name,
            unit: col(row, "unit") || "式",
            standardCost: Number(col(row, "standardCost")) || 0,
            laborCost: Number(col(row, "laborCost")) || 0,
            memo: col(row, "memo") || null,
            favorite: col(row, "favorite") === "1",
            active: col(row, "active") !== "0",
          });
          result.imported++;
          break;
        }
        case "materials": {
          const name = col(row, "name");
          const category = col(row, "category") || "その他";
          if (!name) {
            result.skipped++;
            continue;
          }
          createMasterV1Material({
            category,
            code: col(row, "code") || undefined,
            name,
            maker: col(row, "maker") || null,
            model: col(row, "model") || null,
            unit: col(row, "unit") || "個",
            cost: Number(col(row, "cost")) || 0,
            memo: col(row, "memo") || null,
            favorite: col(row, "favorite") === "1",
            active: col(row, "active") !== "0",
          });
          result.imported++;
          break;
        }
        default:
          result.errors.push(`${entity} のCSVインポートは未対応です`);
          return result;
      }
    } catch (e) {
      result.errors.push(`行${i + 2}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

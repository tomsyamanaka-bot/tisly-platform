import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type {
  MasterV1Customer,
  MasterV1CustomerPrice,
  MasterV1Material,
  MasterV1Rank,
  MasterV1SymbolMapping,
  MasterV1WorkItem,
} from "./master-v1-types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function rowCustomer(r: Record<string, unknown>): MasterV1Customer {
  return {
    id: String(r.id),
    customerCode: String(r.customer_code),
    name: String(r.name),
    rankId: r.rank_id != null ? String(r.rank_id) : null,
    contactName: r.contact_name != null ? String(r.contact_name) : null,
    phone: r.phone != null ? String(r.phone) : null,
    email: r.email != null ? String(r.email) : null,
    address: r.address != null ? String(r.address) : null,
    memo: r.memo != null ? String(r.memo) : null,
    favorite: Number(r.favorite ?? 0) === 1,
    active: Number(r.active ?? 1) === 1,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowRank(r: Record<string, unknown>): MasterV1Rank {
  return {
    id: String(r.id),
    name: String(r.name),
    costMultiplier: Number(r.cost_multiplier ?? 1),
    laborMultiplier: Number(r.labor_multiplier ?? 1),
    memo: r.memo != null ? String(r.memo) : null,
    sortOrder: Number(r.sort_order ?? 0),
    active: Number(r.active ?? 1) === 1,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowWorkItem(r: Record<string, unknown>): MasterV1WorkItem {
  return {
    id: String(r.id),
    category: String(r.category),
    code: String(r.code),
    name: String(r.name),
    unit: String(r.unit ?? "式"),
    standardCost: Number(r.standard_cost ?? 0),
    laborCost: Number(r.labor_cost ?? 0),
    memo: r.memo != null ? String(r.memo) : null,
    favorite: Number(r.favorite ?? 0) === 1,
    active: Number(r.active ?? 1) === 1,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowMaterial(r: Record<string, unknown>): MasterV1Material {
  return {
    id: String(r.id),
    category: String(r.category),
    code: String(r.code),
    name: String(r.name),
    maker: r.maker != null ? String(r.maker) : null,
    model: r.model != null ? String(r.model) : null,
    unit: String(r.unit ?? "個"),
    cost: Number(r.cost ?? 0),
    memo: r.memo != null ? String(r.memo) : null,
    favorite: Number(r.favorite ?? 0) === 1,
    active: Number(r.active ?? 1) === 1,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowCustomerPrice(r: Record<string, unknown>): MasterV1CustomerPrice {
  return {
    id: String(r.id),
    customerId: String(r.customer_id),
    itemType: r.item_type === "material" ? "material" : "work",
    itemId: String(r.item_id),
    unitPrice: Number(r.unit_price ?? 0),
    costPrice: Number(r.cost_price ?? 0),
    memo: r.memo != null ? String(r.memo) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowSymbolMapping(r: Record<string, unknown>): MasterV1SymbolMapping {
  return {
    id: String(r.id),
    mappingKind: r.mapping_kind === "line" ? "line" : "symbol",
    symbolType: String(r.symbol_type),
    label: String(r.label),
    workItemId: r.work_item_id != null ? String(r.work_item_id) : null,
    materialId: r.material_id != null ? String(r.material_id) : null,
    qtyPerUnit: Number(r.qty_per_unit ?? 1),
    memo: r.memo != null ? String(r.memo) : null,
    active: Number(r.active ?? 1) === 1,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export interface MasterV1ListOpts {
  q?: string;
  category?: string;
  favoriteOnly?: boolean;
  activeOnly?: boolean;
}

function buildWhere(
  base: string[],
  params: unknown[],
  opts?: MasterV1ListOpts,
  searchCols?: string[]
): string {
  if (opts?.category) {
    base.push("category = ?");
    params.push(opts.category);
  }
  if (opts?.favoriteOnly) {
    base.push("favorite = 1");
  }
  if (opts?.activeOnly !== false) {
    base.push("active = 1");
  }
  if (opts?.q && searchCols?.length) {
    const like = `%${opts.q}%`;
    base.push(`(${searchCols.map((c) => `${c} LIKE ?`).join(" OR ")})`);
    for (const _ of searchCols) params.push(like);
  }
  return base.length ? `WHERE ${base.join(" AND ")}` : "";
}

// —— Customers ——

export function listMasterV1Customers(opts?: MasterV1ListOpts): MasterV1Customer[] {
  const params: unknown[] = [];
  const where = buildWhere([], params, opts, ["name", "customer_code", "contact_name"]);
  const rows = getDatabase()
    .prepare(`SELECT * FROM master_v1_customers ${where} ORDER BY favorite DESC, sort_order ASC, name ASC`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowCustomer);
}

export function getMasterV1Customer(id: string): MasterV1Customer | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM master_v1_customers WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowCustomer(row) : null;
}

export function createMasterV1Customer(input: Partial<MasterV1Customer> & { name: string }): MasterV1Customer {
  const id = uuid();
  const now = nowIso();
  const code = input.customerCode?.trim() || `C-${id.slice(0, 8).toUpperCase()}`;
  getDatabase()
    .prepare(
      `INSERT INTO master_v1_customers (
        id, customer_code, name, rank_id, contact_name, phone, email, address, memo,
        favorite, active, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      code,
      input.name,
      input.rankId ?? null,
      input.contactName ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.memo ?? null,
      input.favorite ? 1 : 0,
      input.active !== false ? 1 : 0,
      input.sortOrder ?? 0,
      now,
      now
    );
  return getMasterV1Customer(id)!;
}

export function updateMasterV1Customer(
  id: string,
  patch: Partial<Omit<MasterV1Customer, "id" | "createdAt" | "updatedAt">>
): MasterV1Customer | null {
  const existing = getMasterV1Customer(id);
  if (!existing) return null;
  const now = nowIso();
  getDatabase()
    .prepare(
      `UPDATE master_v1_customers SET
        customer_code = ?, name = ?, rank_id = ?, contact_name = ?, phone = ?,
        email = ?, address = ?, memo = ?, favorite = ?, active = ?, sort_order = ?, updated_at = ?
      WHERE id = ?`
    )
    .run(
      patch.customerCode ?? existing.customerCode,
      patch.name ?? existing.name,
      patch.rankId !== undefined ? patch.rankId : existing.rankId,
      patch.contactName !== undefined ? patch.contactName : existing.contactName,
      patch.phone !== undefined ? patch.phone : existing.phone,
      patch.email !== undefined ? patch.email : existing.email,
      patch.address !== undefined ? patch.address : existing.address,
      patch.memo !== undefined ? patch.memo : existing.memo,
      (patch.favorite ?? existing.favorite) ? 1 : 0,
      (patch.active ?? existing.active) ? 1 : 0,
      patch.sortOrder ?? existing.sortOrder,
      now,
      id
    );
  return getMasterV1Customer(id);
}

export function deleteMasterV1Customer(id: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM master_v1_customers WHERE id = ?`).run(id);
  return r.changes > 0;
}

// —— Ranks ——

export function listMasterV1Ranks(opts?: MasterV1ListOpts): MasterV1Rank[] {
  const params: unknown[] = [];
  const where = buildWhere([], params, { ...opts, category: undefined }, ["name"]);
  const rows = getDatabase()
    .prepare(`SELECT * FROM master_v1_ranks ${where} ORDER BY sort_order ASC, name ASC`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowRank);
}

export function getMasterV1Rank(id: string): MasterV1Rank | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM master_v1_ranks WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowRank(row) : null;
}

export function createMasterV1Rank(input: Partial<MasterV1Rank> & { name: string }): MasterV1Rank {
  const id = uuid();
  const now = nowIso();
  getDatabase()
    .prepare(
      `INSERT INTO master_v1_ranks (id, name, cost_multiplier, labor_multiplier, memo, sort_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.name,
      input.costMultiplier ?? 2.0,
      input.laborMultiplier ?? 2.0,
      input.memo ?? null,
      input.sortOrder ?? 0,
      input.active !== false ? 1 : 0,
      now,
      now
    );
  return getMasterV1Rank(id)!;
}

export function updateMasterV1Rank(
  id: string,
  patch: Partial<Omit<MasterV1Rank, "id" | "createdAt" | "updatedAt">>
): MasterV1Rank | null {
  const existing = getMasterV1Rank(id);
  if (!existing) return null;
  const now = nowIso();
  getDatabase()
    .prepare(
      `UPDATE master_v1_ranks SET name = ?, cost_multiplier = ?, labor_multiplier = ?, memo = ?,
        sort_order = ?, active = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      patch.name ?? existing.name,
      patch.costMultiplier ?? existing.costMultiplier,
      patch.laborMultiplier ?? existing.laborMultiplier,
      patch.memo !== undefined ? patch.memo : existing.memo,
      patch.sortOrder ?? existing.sortOrder,
      (patch.active ?? existing.active) ? 1 : 0,
      now,
      id
    );
  return getMasterV1Rank(id);
}

export function deleteMasterV1Rank(id: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM master_v1_ranks WHERE id = ?`).run(id);
  return r.changes > 0;
}

// —— Work items ——

export function listMasterV1WorkItems(opts?: MasterV1ListOpts): MasterV1WorkItem[] {
  const params: unknown[] = [];
  const where = buildWhere([], params, opts, ["name", "code", "category"]);
  const rows = getDatabase()
    .prepare(`SELECT * FROM master_v1_work_items ${where} ORDER BY favorite DESC, category ASC, sort_order ASC, name ASC`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowWorkItem);
}

export function getMasterV1WorkItem(id: string): MasterV1WorkItem | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM master_v1_work_items WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowWorkItem(row) : null;
}

export function createMasterV1WorkItem(input: Partial<MasterV1WorkItem> & { name: string; category: string }): MasterV1WorkItem {
  const id = uuid();
  const now = nowIso();
  const code = input.code?.trim() || `W-${id.slice(0, 8).toUpperCase()}`;
  getDatabase()
    .prepare(
      `INSERT INTO master_v1_work_items (
        id, category, code, name, unit, standard_cost, labor_cost, memo, favorite, active, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.category,
      code,
      input.name,
      input.unit ?? "式",
      input.standardCost ?? 0,
      input.laborCost ?? 0,
      input.memo ?? null,
      input.favorite ? 1 : 0,
      input.active !== false ? 1 : 0,
      input.sortOrder ?? 0,
      now,
      now
    );
  return getMasterV1WorkItem(id)!;
}

export function updateMasterV1WorkItem(
  id: string,
  patch: Partial<Omit<MasterV1WorkItem, "id" | "createdAt" | "updatedAt">>
): MasterV1WorkItem | null {
  const existing = getMasterV1WorkItem(id);
  if (!existing) return null;
  const now = nowIso();
  getDatabase()
    .prepare(
      `UPDATE master_v1_work_items SET category = ?, code = ?, name = ?, unit = ?,
        standard_cost = ?, labor_cost = ?, memo = ?, favorite = ?, active = ?, sort_order = ?, updated_at = ?
      WHERE id = ?`
    )
    .run(
      patch.category ?? existing.category,
      patch.code ?? existing.code,
      patch.name ?? existing.name,
      patch.unit ?? existing.unit,
      patch.standardCost ?? existing.standardCost,
      patch.laborCost ?? existing.laborCost,
      patch.memo !== undefined ? patch.memo : existing.memo,
      (patch.favorite ?? existing.favorite) ? 1 : 0,
      (patch.active ?? existing.active) ? 1 : 0,
      patch.sortOrder ?? existing.sortOrder,
      now,
      id
    );
  return getMasterV1WorkItem(id);
}

export function deleteMasterV1WorkItem(id: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM master_v1_work_items WHERE id = ?`).run(id);
  return r.changes > 0;
}

// —— Materials ——

export function listMasterV1Materials(opts?: MasterV1ListOpts): MasterV1Material[] {
  const params: unknown[] = [];
  const where = buildWhere([], params, opts, ["name", "code", "category", "maker", "model"]);
  const rows = getDatabase()
    .prepare(`SELECT * FROM master_v1_materials ${where} ORDER BY favorite DESC, category ASC, sort_order ASC, name ASC`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowMaterial);
}

export function getMasterV1Material(id: string): MasterV1Material | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM master_v1_materials WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowMaterial(row) : null;
}

export function createMasterV1Material(
  input: Partial<MasterV1Material> & { name: string; category: string }
): MasterV1Material {
  const id = uuid();
  const now = nowIso();
  const code = input.code?.trim() || `M-${id.slice(0, 8).toUpperCase()}`;
  getDatabase()
    .prepare(
      `INSERT INTO master_v1_materials (
        id, category, code, name, maker, model, unit, cost, memo, favorite, active, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.category,
      code,
      input.name,
      input.maker ?? null,
      input.model ?? null,
      input.unit ?? "個",
      input.cost ?? 0,
      input.memo ?? null,
      input.favorite ? 1 : 0,
      input.active !== false ? 1 : 0,
      input.sortOrder ?? 0,
      now,
      now
    );
  return getMasterV1Material(id)!;
}

export function updateMasterV1Material(
  id: string,
  patch: Partial<Omit<MasterV1Material, "id" | "createdAt" | "updatedAt">>
): MasterV1Material | null {
  const existing = getMasterV1Material(id);
  if (!existing) return null;
  const now = nowIso();
  getDatabase()
    .prepare(
      `UPDATE master_v1_materials SET category = ?, code = ?, name = ?, maker = ?, model = ?, unit = ?,
        cost = ?, memo = ?, favorite = ?, active = ?, sort_order = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      patch.category ?? existing.category,
      patch.code ?? existing.code,
      patch.name ?? existing.name,
      patch.maker !== undefined ? patch.maker : existing.maker,
      patch.model !== undefined ? patch.model : existing.model,
      patch.unit ?? existing.unit,
      patch.cost ?? existing.cost,
      patch.memo !== undefined ? patch.memo : existing.memo,
      (patch.favorite ?? existing.favorite) ? 1 : 0,
      (patch.active ?? existing.active) ? 1 : 0,
      patch.sortOrder ?? existing.sortOrder,
      now,
      id
    );
  return getMasterV1Material(id);
}

export function deleteMasterV1Material(id: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM master_v1_materials WHERE id = ?`).run(id);
  return r.changes > 0;
}

// —— Customer prices ——

export function listMasterV1CustomerPrices(opts?: { customerId?: string }): MasterV1CustomerPrice[] {
  const params: unknown[] = [];
  let where = "";
  if (opts?.customerId) {
    where = "WHERE customer_id = ?";
    params.push(opts.customerId);
  }
  const rows = getDatabase()
    .prepare(`SELECT * FROM master_v1_customer_prices ${where} ORDER BY customer_id ASC, item_type ASC`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowCustomerPrice);
}

export function getMasterV1CustomerPrice(id: string): MasterV1CustomerPrice | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM master_v1_customer_prices WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowCustomerPrice(row) : null;
}

export function createMasterV1CustomerPrice(
  input: Omit<MasterV1CustomerPrice, "id" | "createdAt" | "updatedAt">
): MasterV1CustomerPrice {
  const id = uuid();
  const now = nowIso();
  getDatabase()
    .prepare(
      `INSERT INTO master_v1_customer_prices (id, customer_id, item_type, item_id, unit_price, cost_price, memo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.customerId,
      input.itemType,
      input.itemId,
      input.unitPrice,
      input.costPrice,
      input.memo ?? null,
      now,
      now
    );
  return getMasterV1CustomerPrice(id)!;
}

export function updateMasterV1CustomerPrice(
  id: string,
  patch: Partial<Omit<MasterV1CustomerPrice, "id" | "createdAt" | "updatedAt">>
): MasterV1CustomerPrice | null {
  const existing = getMasterV1CustomerPrice(id);
  if (!existing) return null;
  const now = nowIso();
  getDatabase()
    .prepare(
      `UPDATE master_v1_customer_prices SET customer_id = ?, item_type = ?, item_id = ?,
        unit_price = ?, cost_price = ?, memo = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      patch.customerId ?? existing.customerId,
      patch.itemType ?? existing.itemType,
      patch.itemId ?? existing.itemId,
      patch.unitPrice ?? existing.unitPrice,
      patch.costPrice ?? existing.costPrice,
      patch.memo !== undefined ? patch.memo : existing.memo,
      now,
      id
    );
  return getMasterV1CustomerPrice(id);
}

export function deleteMasterV1CustomerPrice(id: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM master_v1_customer_prices WHERE id = ?`).run(id);
  return r.changes > 0;
}

// —— Symbol mappings ——

export function listMasterV1SymbolMappings(opts?: { activeOnly?: boolean }): MasterV1SymbolMapping[] {
  const params: unknown[] = [];
  let where = "";
  if (opts?.activeOnly !== false) {
    where = "WHERE active = 1";
  }
  const rows = getDatabase()
    .prepare(`SELECT * FROM master_v1_symbol_mappings ${where} ORDER BY sort_order ASC, symbol_type ASC`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowSymbolMapping);
}

export function getMasterV1SymbolMapping(id: string): MasterV1SymbolMapping | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM master_v1_symbol_mappings WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowSymbolMapping(row) : null;
}

export function findSymbolMappingByType(
  symbolType: string,
  mappingKind: "symbol" | "line"
): MasterV1SymbolMapping | null {
  const row = getDatabase()
    .prepare(
      `SELECT * FROM master_v1_symbol_mappings WHERE symbol_type = ? AND mapping_kind = ? AND active = 1
       ORDER BY sort_order ASC LIMIT 1`
    )
    .get(symbolType, mappingKind) as Record<string, unknown> | undefined;
  return row ? rowSymbolMapping(row) : null;
}

export function createMasterV1SymbolMapping(
  input: Omit<MasterV1SymbolMapping, "id" | "createdAt" | "updatedAt">
): MasterV1SymbolMapping {
  const id = uuid();
  const now = nowIso();
  getDatabase()
    .prepare(
      `INSERT INTO master_v1_symbol_mappings (
        id, mapping_kind, symbol_type, label, work_item_id, material_id, qty_per_unit, memo, active, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.mappingKind,
      input.symbolType,
      input.label,
      input.workItemId ?? null,
      input.materialId ?? null,
      input.qtyPerUnit,
      input.memo ?? null,
      input.active !== false ? 1 : 0,
      input.sortOrder ?? 0,
      now,
      now
    );
  return getMasterV1SymbolMapping(id)!;
}

export function updateMasterV1SymbolMapping(
  id: string,
  patch: Partial<Omit<MasterV1SymbolMapping, "id" | "createdAt" | "updatedAt">>
): MasterV1SymbolMapping | null {
  const existing = getMasterV1SymbolMapping(id);
  if (!existing) return null;
  const now = nowIso();
  getDatabase()
    .prepare(
      `UPDATE master_v1_symbol_mappings SET mapping_kind = ?, symbol_type = ?, label = ?,
        work_item_id = ?, material_id = ?, qty_per_unit = ?, memo = ?, active = ?, sort_order = ?, updated_at = ?
      WHERE id = ?`
    )
    .run(
      patch.mappingKind ?? existing.mappingKind,
      patch.symbolType ?? existing.symbolType,
      patch.label ?? existing.label,
      patch.workItemId !== undefined ? patch.workItemId : existing.workItemId,
      patch.materialId !== undefined ? patch.materialId : existing.materialId,
      patch.qtyPerUnit ?? existing.qtyPerUnit,
      patch.memo !== undefined ? patch.memo : existing.memo,
      (patch.active ?? existing.active) ? 1 : 0,
      patch.sortOrder ?? existing.sortOrder,
      now,
      id
    );
  return getMasterV1SymbolMapping(id);
}

export function deleteMasterV1SymbolMapping(id: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM master_v1_symbol_mappings WHERE id = ?`).run(id);
  return r.changes > 0;
}

// —— Bulk update ——

export function bulkUpdateMasterV1(
  entity: "customers" | "work-items" | "materials",
  ids: string[],
  patch: Record<string, unknown>
): number {
  let updated = 0;
  for (const id of ids) {
    let result: unknown = null;
    if (entity === "customers") {
      result = updateMasterV1Customer(id, patch as Partial<MasterV1Customer>);
    } else if (entity === "work-items") {
      result = updateMasterV1WorkItem(id, patch as Partial<MasterV1WorkItem>);
    } else if (entity === "materials") {
      result = updateMasterV1Material(id, patch as Partial<MasterV1Material>);
    }
    if (result) updated++;
  }
  return updated;
}

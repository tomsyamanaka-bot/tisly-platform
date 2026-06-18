/** 案件ID採番 v1 — {市コード}-{YY}-{MMDD}-{連番} 例: MO-26-0616-001 */

import { getDatabase } from "../db/database.js";

export interface ProjectCityCodeV1 {
  cityCode: string;
  cityName: string;
  sortOrder: number;
  active: boolean;
}

const CITY_NAME_PATTERNS: Array<{ code: string; patterns: RegExp[] }> = [
  { code: "MO", patterns: [/守谷市/, /守谷/] },
  { code: "JY", patterns: [/常総市/, /常総/] },
  { code: "TM", patterns: [/つくばみらい市/, /つくばみらい/] },
  { code: "TS", patterns: [/つくば市/, /つくば/] },
];

/** つくばみらいを先に判定（つくば市を含むため） */
const DETECT_ORDER = ["TM", "TS", "MO", "JY"];

export function listProjectCityCodesV1(): ProjectCityCodeV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT city_code, city_name, sort_order, active
       FROM project_city_codes
       WHERE active = 1
       ORDER BY sort_order ASC, city_code ASC`
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    cityCode: String(r.city_code),
    cityName: String(r.city_name),
    sortOrder: Number(r.sort_order ?? 0),
    active: Boolean(r.active),
  }));
}

export function getCityCodeByName(municipality: string): string | null {
  const trimmed = municipality.trim();
  if (!trimmed) return null;
  const row = getDatabase()
    .prepare(`SELECT city_code FROM project_city_codes WHERE city_name = ? AND active = 1`)
    .get(trimmed) as { city_code: string } | undefined;
  return row?.city_code ?? null;
}

export function detectCityCodeFromText(text: string): string {
  const src = text.trim();
  if (!src) return "MO";

  for (const code of DETECT_ORDER) {
    const entry = CITY_NAME_PATTERNS.find((c) => c.code === code);
    if (!entry) continue;
    if (entry.patterns.some((p) => p.test(src))) return code;
  }

  const byName = getCityCodeByName(src);
  if (byName) return byName;

  return "MO";
}

export function resolveCityCodeForProject(input: {
  municipality?: string;
  address?: string;
  cityCode?: string;
}): string {
  if (input.cityCode) {
    const code = input.cityCode.trim().toUpperCase();
    const exists = getDatabase()
      .prepare(`SELECT 1 FROM project_city_codes WHERE city_code = ? AND active = 1`)
      .get(code);
    if (exists) return code;
  }
  const fromMunicipality = input.municipality ? getCityCodeByName(input.municipality) : null;
  if (fromMunicipality) return fromMunicipality;
  if (input.municipality) {
    const detected = detectCityCodeFromText(input.municipality);
    if (detected) return detected;
  }
  if (input.address) return detectCityCodeFromText(input.address);
  return "MO";
}

function formatDateParts(date = new Date()): { yy: string; mmdd: string; dateKey: string } {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const mmdd = `${mm}${dd}`;
  return { yy, mmdd, dateKey: `${yy}${mmdd}` };
}

/**
 * 同日・同市で連番を採番（重複禁止）。
 * トランザクション内で project_no_sequences を更新。
 */
export function allocateProjectNoV1(cityCode: string, at = new Date()): string {
  const code = cityCode.trim().toUpperCase();
  const { yy, mmdd, dateKey } = formatDateParts(at);
  const db = getDatabase();

  const exists = db
    .prepare(`SELECT 1 FROM project_city_codes WHERE city_code = ? AND active = 1`)
    .get(code);
  if (!exists) throw new Error(`Unknown city code: ${code}`);

  const allocate = db.transaction(() => {
    db.prepare(
      `INSERT INTO project_no_sequences (city_code, date_key, last_seq, updated_at)
       VALUES (?, ?, 0, datetime('now'))
       ON CONFLICT(city_code, date_key) DO NOTHING`
    ).run(code, dateKey);

    const row = db
      .prepare(
        `SELECT last_seq FROM project_no_sequences WHERE city_code = ? AND date_key = ?`
      )
      .get(code, dateKey) as { last_seq: number };

    const nextSeq = (row?.last_seq ?? 0) + 1;
    db.prepare(
      `UPDATE project_no_sequences SET last_seq = ?, updated_at = datetime('now')
       WHERE city_code = ? AND date_key = ?`
    ).run(nextSeq, code, dateKey);

    const projectNo = `${code}-${yy}-${mmdd}-${String(nextSeq).padStart(3, "0")}`;

    const dup = db
      .prepare(`SELECT 1 FROM business_projects WHERE project_no = ?`)
      .get(projectNo);
    if (dup) throw new Error(`Project number collision: ${projectNo}`);

    return projectNo;
  });

  return allocate();
}

export function buildQnapFolderPathV1(projectNo: string): string {
  const safe = projectNo.replace(/[/\\]/g, "-");
  return `/案件/${safe}/`;
}

/** 見積・請求番号用 — 市区町村不明時は XX（案件ID採番の MO デフォルトとは別） */
export function resolveCityCodeForDocNo(input: {
  municipality?: string;
  address?: string;
  cityCode?: string;
}): string {
  if (input.cityCode) {
    const code = input.cityCode.trim().toUpperCase();
    const exists = getDatabase()
      .prepare(`SELECT 1 FROM project_city_codes WHERE city_code = ? AND active = 1`)
      .get(code);
    if (exists) return code;
  }
  const fromMunicipality = input.municipality ? getCityCodeByName(input.municipality) : null;
  if (fromMunicipality) return fromMunicipality;

  const text = [input.municipality, input.address].filter(Boolean).join(" ").trim();
  if (!text) return "XX";

  for (const code of DETECT_ORDER) {
    const entry = CITY_NAME_PATTERNS.find((c) => c.code === code);
    if (entry?.patterns.some((p) => p.test(text))) return code;
  }

  return "XX";
}

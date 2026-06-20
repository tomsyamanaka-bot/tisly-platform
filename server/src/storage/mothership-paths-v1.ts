/**
 * TiSLY MotherShip パス v1
 * QNAP TS-464 (TiSLYNAS / 192.168.1.10 / \\192.168.1.10\TiSLY)
 *
 * 案件ID: {市コード}-{YY}-{MMDD}[-{連番}]
 * 例: MO-26-0620 / MO-26-0620-001 / JY-26-0701-002
 */
import { sanitizePathSegment } from "./qnap-path-builder-v1.js";

export const MOTHERSHIP_SHARE = "TiSLY";
export const MOTHERSHIP_UNC = "\\\\192.168.1.10\\TiSLY";
export const MOTHERSHIP_HOST = "192.168.1.10";

/** MotherShip 標準トップフォルダ（QNAP 上に手動作成済み） */
export const MOTHERSHIP_TOP_FOLDERS = [
  "AI",
  "Backups",
  "Customers",
  "Documents",
  "ESP",
  "Estimates",
  "Photos",
  "PLC",
  "Projects",
  "Reports",
  "Scan",
  "SiteMaps",
] as const;

export type MothershipTopFolder = (typeof MOTHERSHIP_TOP_FOLDERS)[number];

/** 案件IDで保存するカテゴリ */
export type MothershipProjectCategory =
  | "Projects"
  | "Photos"
  | "Reports"
  | "Documents";

const PROJECT_NO_RE = /^([A-Z]{2})-(\d{2})-(\d{4})(?:-(\d{3}))?$/;

export interface ParsedProjectNoV1 {
  cityCode: string;
  yy: string;
  mmdd: string;
  seq: string | null;
  /** 日付プレフィックス MO-26-0620 */
  datePrefix: string;
  raw: string;
}

export function parseProjectNoV1(projectNo: string): ParsedProjectNoV1 | null {
  const raw = String(projectNo ?? "").trim().toUpperCase();
  const m = PROJECT_NO_RE.exec(raw);
  if (!m) return null;
  const [, cityCode, yy, mmdd, seq] = m;
  return {
    cityCode,
    yy,
    mmdd,
    seq: seq ?? null,
    datePrefix: `${cityCode}-${yy}-${mmdd}`,
    raw,
  };
}

export function isValidProjectNoV1(projectNo: string): boolean {
  return parseProjectNoV1(projectNo) !== null;
}

/** 案件フォルダ名 — {projectNo}_{siteName} */
export function buildMothershipProjectSegment(projectNo: string, siteName: string): string {
  const no = sanitizePathSegment(projectNo);
  const site = sanitizePathSegment(siteName || "現場");
  return `${no}_${site}`;
}

/**
 * MotherShip 上の相対パス（UNC/WebDAV 共通）
 * 例: Projects/MO-26-0620-001_守谷市テスト/source/
 */
export function buildMothershipProjectRelativePath(
  category: MothershipProjectCategory,
  projectNo: string,
  siteName: string,
  subPath = ""
): string {
  const parsed = parseProjectNoV1(projectNo);
  if (!parsed) {
    throw new Error(`Invalid project number: ${projectNo}`);
  }
  const segment = buildMothershipProjectSegment(parsed.raw, siteName);
  const sub = subPath.replace(/^\/+|\/+$/g, "");
  const base = `${category}/${segment}`;
  return sub ? `${base}/${sub}` : base;
}

/** カテゴリ別の推奨サブフォルダ */
export function defaultMothershipSubFolder(
  category: MothershipProjectCategory,
  kind?: "estimate" | "invoice" | "specification" | "completion-report" | "survey" | "manual"
): string {
  switch (category) {
    case "Projects":
      return "source";
    case "Photos":
      return kind === "survey" ? "survey" : "completion";
    case "Reports":
      return "completion-report";
    case "Documents":
      if (kind === "estimate") return "estimates";
      if (kind === "invoice") return "invoices";
      if (kind === "specification") return "specifications";
      if (kind === "manual") return "manuals";
      return "misc";
    default:
      return "misc";
  }
}

export function buildMothershipFileRelativePath(input: {
  category: MothershipProjectCategory;
  projectNo: string;
  siteName: string;
  fileName: string;
  subFolder?: string;
}): string {
  const sub = input.subFolder ?? defaultMothershipSubFolder(input.category);
  const dir = buildMothershipProjectRelativePath(
    input.category,
    input.projectNo,
    input.siteName,
    sub
  );
  return `${dir}/${sanitizePathSegment(input.fileName)}`.replace(/\\/g, "/");
}

/** リポジトリ robocopy バックアップ先 */
export function buildMothershipRepoBackupRelativePath(): string {
  return "Backups/repo-mirror";
}

/** ライブラリ系（案件ID不要） */
export function buildMothershipLibraryRelativePath(
  folder: "PLC" | "ESP" | "AI" | "Scan" | "SiteMaps" | "Customers" | "Estimates",
  subPath = ""
): string {
  const sub = subPath.replace(/^\/+|\/+$/g, "");
  return sub ? `${folder}/${sub}` : folder;
}

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
  "3DPrint",
] as const;

/** 3DPrint 配下サブフォルダ（MotherShip 手動/自動作成） */
export const MOTHERSHIP_3DPRINT_SUBFOLDERS = [
  "CAD",
  "STL",
  "STEP",
  "GCode",
  "Photos",
  "Prototypes",
  "Parts",
  "Manuals",
] as const;

export type Mothership3DPrintSubfolder = (typeof MOTHERSHIP_3DPRINT_SUBFOLDERS)[number];

/** PLC 資産サブフォルダ（GX Works3） */
export const MOTHERSHIP_PLC_SUBFOLDERS = [
  "Templates",
  "Projects",
  "Libraries",
  "IOMaps",
  "Manuals",
  "Examples",
] as const;

export type MothershipPlcSubfolder = (typeof MOTHERSHIP_PLC_SUBFOLDERS)[number];

/** 3DPrint 拡張サブフォルダ（Knowledge Automation v1） */
export const MOTHERSHIP_3DPRINT_ASSET_SUBFOLDERS = [
  "Parts",
  "Assemblies",
  "Fixtures",
  "RP2350",
  "PLC",
  "Camera",
  "DINRail",
  "FactoryMiniature",
  "Manuals",
  ...MOTHERSHIP_3DPRINT_SUBFOLDERS,
] as const;

export type Mothership3DPrintAssetSubfolder = (typeof MOTHERSHIP_3DPRINT_ASSET_SUBFOLDERS)[number];

/** TiSLY Factory 専用サブフォルダ */
export const MOTHERSHIP_FACTORY_SUBFOLDERS = [
  "Conveyor",
  "Crusher",
  "Sorter",
  "Tank",
  "Sensor",
  "PLC",
  "HMI",
  "Modbus",
  "Demo",
] as const;

export type MothershipFactorySubfolder = (typeof MOTHERSHIP_FACTORY_SUBFOLDERS)[number];

/** MotherShip トップに Factory を追加（Explorer 用） */
export const MOTHERSHIP_TOP_FOLDERS_WITH_FACTORY = [
  ...MOTHERSHIP_TOP_FOLDERS,
  "Factory",
] as const;

/** 例: 3DPrint/STL/bracket-v2.stl */
export function buildMothership3DPrintRelativePath(subFolder: Mothership3DPrintSubfolder, fileName = ""): string {
  const base = `3DPrint/${subFolder}`;
  const file = String(fileName ?? "").trim().replace(/^\/+|\/+$/g, "");
  return file ? `${base}/${sanitizePathSegment(file)}` : base;
}

/** 例: PLC/Templates/self-hold.gxw */
export function buildMothershipPlcRelativePath(subFolder: MothershipPlcSubfolder, fileName = ""): string {
  const base = `PLC/${subFolder}`;
  const file = String(fileName ?? "").trim().replace(/^\/+|\/+$/g, "");
  return file ? `${base}/${sanitizePathSegment(file)}` : base;
}

/** 例: 3DPrint/Parts/bracket.stl（拡張サブフォルダ） */
export function buildMothership3DPrintAssetRelativePath(
  subFolder: Mothership3DPrintAssetSubfolder,
  fileName = ""
): string {
  const base = `3DPrint/${subFolder}`;
  const file = String(fileName ?? "").trim().replace(/^\/+|\/+$/g, "");
  return file ? `${base}/${sanitizePathSegment(file)}` : base;
}

/** 例: Factory/Conveyor/line-demo.json */
export function buildMothershipFactoryRelativePath(subFolder: MothershipFactorySubfolder, fileName = ""): string {
  const base = `Factory/${subFolder}`;
  const file = String(fileName ?? "").trim().replace(/^\/+|\/+$/g, "");
  return file ? `${base}/${sanitizePathSegment(file)}` : base;
}

/** 案件IDで全資産を横断検索する際のプレフィックス */
export function buildMothershipProjectNoQueryPrefix(projectNo: string): string {
  const parsed = parseProjectNoV1(projectNo);
  if (!parsed) throw new Error(`Invalid project number: ${projectNo}`);
  return parsed.raw;
}

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

/** TiSLY Knowledge — AI 配下サブフォルダ（QNAP 手動作成済み想定） */
export const MOTHERSHIP_KNOWLEDGE_FOLDERS = [
  "Standards",
  "Procedures",
  "Troubles",
  "Templates",
  "Ladder",
  "Materials",
  "Tools",
  "Notes",
  "PLC",
  "RP",
  "3DPrint",
  "KnowledgeCards",
  "SearchIndex",
] as const;

export type MothershipKnowledgeFolder = (typeof MOTHERSHIP_KNOWLEDGE_FOLDERS)[number];

/** 例: AI/KnowledgeCards/PLC-SELF-HOLD-001.json */
export function buildMothershipKnowledgeRelativePath(
  folder: MothershipKnowledgeFolder,
  subPath = ""
): string {
  const sub = subPath.replace(/^\/+|\/+$/g, "");
  const base = `AI/${folder}`;
  return sub ? `${base}/${sub}` : base;
}

/** ライブラリ系（案件ID不要） */
export function buildMothershipLibraryRelativePath(
  folder: "PLC" | "ESP" | "AI" | "Scan" | "SiteMaps" | "Customers" | "Estimates",
  subPath = ""
): string {
  const sub = subPath.replace(/^\/+|\/+$/g, "");
  return sub ? `${folder}/${sub}` : folder;
}

/**
 * 見積書・請求書バックアップ用パス（nastoms / TiSLY 共有）
 * 例: Invoices_Estimates/2026-08/estimate-xxx.pdf
 * 絶対表示: /TiSLY/Invoices_Estimates/2026-08/estimate-xxx.pdf
 * フォールバック: /Public/TiSLY/Invoices_Estimates/2026-08/estimate-xxx.pdf
 */
export const INVOICES_ESTIMATES_BACKUP_ROOT = "Invoices_Estimates";
/** 旧パス互換（pending キュー等） */
export const INVOICES_ESTIMATES_BACKUP_ROOT_LEGACY = "TiSLY_Storage/Invoices_Estimates";
export const INVOICES_ESTIMATES_ABSOLUTE_PREFIX = "/TiSLY/Invoices_Estimates";
export const INVOICES_ESTIMATES_PUBLIC_ABSOLUTE_PREFIX =
  "/Public/TiSLY/Invoices_Estimates";

/** YYYY-MM（JST 基準） */
export function invoicesEstimatesMonthFolderV1(date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  });
  // en-CA → YYYY-MM-DD 形式の先頭7文字
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

/** 相対パス（先頭スラッシュなし・WebDAV /TiSLY ベース向け） */
export function buildInvoicesEstimatesBackupRelativePathV1(
  fileName: string,
  date = new Date()
): string {
  const month = invoicesEstimatesMonthFolderV1(date);
  const safe = sanitizePathSegment(fileName) || "document.pdf";
  return `${INVOICES_ESTIMATES_BACKUP_ROOT}/${month}/${safe}`;
}

/**
 * QNAP 上の絶対パス（共有名込み）
 * 例: /TiSLY/Invoices_Estimates/2026-08/見積書.pdf
 */
export function buildInvoicesEstimatesAbsolutePathV1(
  fileName: string,
  date = new Date(),
  root: "tisly" | "public_tisly" = "tisly"
): string {
  const month = invoicesEstimatesMonthFolderV1(date);
  const safe = sanitizePathSegment(fileName) || "document.pdf";
  const prefix =
    root === "public_tisly"
      ? INVOICES_ESTIMATES_PUBLIC_ABSOLUTE_PREFIX
      : INVOICES_ESTIMATES_ABSOLUTE_PREFIX;
  return `${prefix}/${month}/${safe}`;
}

/** Public フォールバック用の相対パス（WebDAV ルート `/` 向け） */
export function buildInvoicesEstimatesPublicRelativePathV1(
  fileName: string,
  date = new Date()
): string {
  const month = invoicesEstimatesMonthFolderV1(date);
  const safe = sanitizePathSegment(fileName) || "document.pdf";
  return `Public/TiSLY/${INVOICES_ESTIMATES_BACKUP_ROOT}/${month}/${safe}`;
}

/** 表示用（先頭スラッシュ付き・絶対パス） */
export function buildInvoicesEstimatesBackupDisplayPathV1(
  fileName: string,
  date = new Date()
): string {
  return buildInvoicesEstimatesAbsolutePathV1(fileName, date, "tisly");
}

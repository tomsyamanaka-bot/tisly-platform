/** Knowledge Customer UI V3 — 案件ファイル adapter（現場写真 · PDF · 部品資料） */

import fs from "fs";
import path from "path";
import {
  getCustomerProjectStorageRefV1,
  getCustomerProjectTemplateKeyV1,
  resolveCustomerProjectMetaV1,
} from "./knowledge-customer-project-adapter-v1.js";
import {
  projectStorageProjectDir,
  projectStorageRootDir,
} from "../storage/project-storage-provider.js";

export type CustomerProjectFileCategoryV1 =
  | "survey_photo"
  | "before_photo"
  | "during_photo"
  | "after_photo"
  | "memo_photo"
  | "specification_pdf"
  | "completion_pdf"
  | "estimate_pdf"
  | "invoice_pdf"
  | "manual_pdf"
  | "part_doc"
  | "print3d";

export interface KnowledgeCustomerProjectFileV1 {
  fileId: string;
  title: string;
  type: CustomerProjectFileCategoryV1;
  category: string;
  previewUrl?: string;
  openUrl?: string;
  safeLabel: string;
  capturedAt?: string;
  areaId?: string;
  sortOrder: number;
}

interface InternalFileRecordV1 {
  fileId: string;
  title: string;
  safeLabel: string;
  type: CustomerProjectFileCategoryV1;
  category: string;
  areaId?: string;
  sortOrder: number;
  capturedAt?: string;
  /** 内部: project-storage 相対パス（レスポンスに出さない） */
  storageRelativePath?: string;
  templateKey?: string;
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function customerFileUrl(ref: string, fileId: string): string {
  return `/api/knowledge/customer-project-file-v1?ref=${encodeURIComponent(ref)}&fileId=${encodeURIComponent(fileId)}`;
}

function safeCustomerUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (/QNAP|SMB|WebDAV|192\.168\.|filemanager|mock fallback|project-storage/i.test(url)) {
    return undefined;
  }
  if (/projectId=/i.test(url)) return undefined;
  return url;
}

/** テンプレ別 mock ファイル定義（ストレージが無い場合のフォールバック） */
const TEMPLATE_MOCK_FILES: Record<string, InternalFileRecordV1[]> = {
  "DEMO-HOME-001": [
    {
      fileId: "entrance-before-1",
      title: "玄関 — 施工前",
      safeLabel: "玄関の施工前写真",
      type: "before_photo",
      category: "玄関",
      areaId: "entrance",
      sortOrder: 10,
    },
    {
      fileId: "entrance-after-1",
      title: "玄関 — 施工後",
      safeLabel: "玄関カメラ設置後",
      type: "after_photo",
      category: "玄関",
      areaId: "entrance",
      sortOrder: 11,
    },
    {
      fileId: "perimeter-before-1",
      title: "外周 — 施工前",
      safeLabel: "外周の施工前写真",
      type: "before_photo",
      category: "外周",
      areaId: "perimeter",
      sortOrder: 20,
    },
    {
      fileId: "perimeter-during-1",
      title: "外周 — 施工中",
      safeLabel: "配線・取付作業中",
      type: "during_photo",
      category: "外周",
      areaId: "perimeter",
      sortOrder: 21,
    },
    {
      fileId: "perimeter-after-1",
      title: "外周 — 施工後",
      safeLabel: "外周カメラ設置後",
      type: "after_photo",
      category: "外周",
      areaId: "perimeter",
      sortOrder: 22,
    },
    {
      fileId: "breaker-1",
      title: "分電盤",
      safeLabel: "分電盤の配線整理",
      type: "memo_photo",
      category: "分電盤",
      areaId: "breaker",
      sortOrder: 30,
    },
    {
      fileId: "driveway-cam-1",
      title: "駐車場カメラ",
      safeLabel: "駐車場の設置イメージ",
      type: "after_photo",
      category: "駐車場",
      areaId: "driveway",
      sortOrder: 40,
    },
    {
      fileId: "spec-pdf",
      title: "仕様書",
      safeLabel: "設備仕様書",
      type: "specification_pdf",
      category: "書類",
      sortOrder: 100,
    },
    {
      fileId: "completion-pdf",
      title: "完了報告書",
      safeLabel: "工事完了報告書",
      type: "completion_pdf",
      category: "書類",
      sortOrder: 101,
    },
    {
      fileId: "estimate-pdf",
      title: "見積書",
      safeLabel: "お見積書",
      type: "estimate_pdf",
      category: "書類",
      sortOrder: 102,
    },
    {
      fileId: "invoice-pdf",
      title: "請求書",
      safeLabel: "請求書",
      type: "invoice_pdf",
      category: "書類",
      sortOrder: 103,
    },
    {
      fileId: "manual-camera",
      title: "防犯カメラ取扱説明",
      safeLabel: "カメラの取扱説明",
      type: "manual_pdf",
      category: "取扱説明",
      areaId: "entrance",
      sortOrder: 110,
    },
    {
      fileId: "part-bracket",
      title: "カメラ取付金具",
      safeLabel: "取付部品資料",
      type: "part_doc",
      category: "部品",
      areaId: "camera-mount",
      sortOrder: 120,
    },
  ],
  "DEMO-FACTORY-001": [
    {
      fileId: "line-1",
      title: "工場ライン",
      safeLabel: "生産ライン全景",
      type: "memo_photo",
      category: "工場ライン",
      areaId: "factory-line",
      sortOrder: 10,
    },
    {
      fileId: "panel-1",
      title: "制御盤",
      safeLabel: "制御盤内部",
      type: "memo_photo",
      category: "制御盤",
      areaId: "panel",
      sortOrder: 20,
    },
    {
      fileId: "factory-line-spec",
      title: "ライン仕様書",
      safeLabel: "生産ライン仕様",
      type: "specification_pdf",
      category: "書類",
      areaId: "factory-line",
      sortOrder: 100,
    },
    {
      fileId: "panel-manual",
      title: "制御盤説明書",
      safeLabel: "制御盤取扱説明",
      type: "manual_pdf",
      category: "取扱説明",
      areaId: "panel",
      sortOrder: 101,
    },
  ],
  "DEMO-NETWORK-001": [
    {
      fileId: "rack-1",
      title: "通信ラック",
      safeLabel: "ラック配線整理後",
      type: "after_photo",
      category: "通信ラック",
      areaId: "rack",
      sortOrder: 10,
    },
    {
      fileId: "office-ap-1",
      title: "事務所アクセスポイント",
      safeLabel: "Wi-Fi改善後",
      type: "after_photo",
      category: "事務所",
      areaId: "office",
      sortOrder: 20,
    },
    {
      fileId: "network-diagram",
      title: "ネットワーク構成図",
      safeLabel: "LAN構成資料",
      type: "specification_pdf",
      category: "書類",
      areaId: "rack",
      sortOrder: 100,
    },
  ],
};

function inferFileMetaFromPath(
  relPath: string,
  fileName: string
): Pick<InternalFileRecordV1, "type" | "category" | "areaId" | "safeLabel"> {
  const lower = relPath.toLowerCase();
  const baseName = path.basename(fileName, path.extname(fileName));

  if (lower.includes("06_写真/完了報告") || lower.includes("completion")) {
    return {
      type: "after_photo",
      category: "完了報告",
      areaId: "perimeter",
      safeLabel: "施工後の現場写真",
    };
  }
  if (lower.includes("06_写真/仕様書") || lower.includes("survey")) {
    return {
      type: "before_photo",
      category: "現調",
      areaId: "entrance",
      safeLabel: "現調時の現場写真",
    };
  }
  if (lower.includes("04_仕様書")) {
    return {
      type: "specification_pdf",
      category: "仕様書",
      safeLabel: "設備仕様書",
    };
  }
  if (lower.includes("05_完了報告")) {
    return {
      type: "completion_pdf",
      category: "完了報告",
      safeLabel: "工事完了報告書",
    };
  }
  if (lower.includes("02_見積")) {
    return {
      type: "estimate_pdf",
      category: "見積",
      safeLabel: "お見積書",
    };
  }
  if (lower.includes("03_請求")) {
    return {
      type: "invoice_pdf",
      category: "請求",
      safeLabel: "請求書",
    };
  }

  const ext = path.extname(fileName).toLowerCase();
  if (IMAGE_EXTS.has(ext)) {
    return {
      type: "memo_photo",
      category: "現場",
      safeLabel: baseName.replace(/_/g, " "),
    };
  }

  return {
    type: "manual_pdf",
    category: "資料",
    safeLabel: baseName.replace(/_/g, " "),
  };
}

function slugFileId(prefix: string, relPath: string): string {
  const slug = relPath
    .replace(/[/\\]/g, "-")
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]+/g, "")
    .slice(0, 48);
  return `${prefix}-${slug}`;
}

function loadFilesFromStorage(storageRef: string): InternalFileRecordV1[] {
  const root = projectStorageProjectDir(storageRef);
  if (!fs.existsSync(root)) return [];

  const records: InternalFileRecordV1[] = [];
  let order = 0;

  function walk(dir: string, relFromProject: string): void {
    for (const name of fs.readdirSync(dir).sort((a, b) => a.localeCompare(b, "ja"))) {
      const abs = path.join(dir, name);
      const rel = relFromProject ? `${relFromProject}/${name}` : name;
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        walk(abs, rel);
        continue;
      }

      const ext = path.extname(name).toLowerCase();
      const isImage = IMAGE_EXTS.has(ext);
      const isPdf = ext === ".pdf";
      if (!isImage && !isPdf) continue;

      const meta = inferFileMetaFromPath(rel, name);
      const fileId = slugFileId("stor", rel);
      order += 1;

      records.push({
        fileId,
        title: path.basename(name, ext).replace(/_/g, " "),
        safeLabel: meta.safeLabel,
        type: meta.type,
        category: meta.category,
        areaId: meta.areaId,
        sortOrder: order,
        capturedAt: stat.mtime.toISOString(),
        storageRelativePath: `${storageRef}/${rel}`.replace(/\\/g, "/"),
      });
    }
  }

  walk(root, "");
  return records;
}

function toPublicFile(ref: string, record: InternalFileRecordV1): KnowledgeCustomerProjectFileV1 {
  const openUrl = customerFileUrl(ref, record.fileId);
  const isPhoto = record.type.includes("photo");
  return {
    fileId: record.fileId,
    title: record.title,
    type: record.type,
    category: record.category,
    previewUrl: isPhoto ? openUrl : undefined,
    openUrl,
    safeLabel: record.safeLabel,
    capturedAt: record.capturedAt,
    areaId: record.areaId,
    sortOrder: record.sortOrder,
  };
}

const internalFileIndex = new Map<string, Map<string, InternalFileRecordV1>>();

function getInternalIndex(ref: string): Map<string, InternalFileRecordV1> {
  const normalized = ref.trim();
  if (internalFileIndex.has(normalized)) {
    return internalFileIndex.get(normalized)!;
  }

  const meta = resolveCustomerProjectMetaV1(normalized);
  const templateKey = meta.templateKey ?? getCustomerProjectTemplateKeyV1(normalized);
  const storageRef = getCustomerProjectStorageRefV1(normalized);

  const records: InternalFileRecordV1[] = [];
  const seenIds = new Set<string>();

  if (storageRef) {
    for (const r of loadFilesFromStorage(storageRef)) {
      if (seenIds.has(r.fileId)) continue;
      seenIds.add(r.fileId);
      records.push(r);
    }
  }

  for (const mock of TEMPLATE_MOCK_FILES[templateKey] ?? []) {
    if (seenIds.has(mock.fileId)) continue;
    seenIds.add(mock.fileId);
    records.push({ ...mock });
  }

  records.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ja"));

  const index = new Map(records.map((r) => [r.fileId, r]));
  internalFileIndex.set(normalized, index);
  return index;
}

export function listCustomerProjectFilesV1(ref: string): KnowledgeCustomerProjectFileV1[] {
  const index = getInternalIndex(ref);
  return [...index.values()].map((r) => toPublicFile(ref, r));
}

export function getCustomerProjectFilesByAreaV1(
  ref: string,
  areaId: string
): KnowledgeCustomerProjectFileV1[] {
  return listCustomerProjectFilesV1(ref).filter((f) => f.areaId === areaId);
}

export function getCustomerProjectPhotosV1(ref: string): KnowledgeCustomerProjectFileV1[] {
  return listCustomerProjectFilesV1(ref).filter((f) => f.type.includes("photo"));
}

export function getCustomerProjectPdfsV1(ref: string): KnowledgeCustomerProjectFileV1[] {
  return listCustomerProjectFilesV1(ref).filter(
    (f) =>
      f.type.includes("pdf") || f.type === "part_doc" || f.type === "print3d"
  );
}

export function resolveCustomerProjectFileInternalV1(
  ref: string,
  fileId: string
): { absolutePath: string; contentType: string; downloadName: string } | null {
  const index = getInternalIndex(ref);
  const record = index.get(fileId);
  if (!record?.storageRelativePath) return null;

  const resolved = path.normalize(
    path.join(projectStorageRootDir(), record.storageRelativePath)
  );
  const storageRoot = path.normalize(projectStorageRootDir());
  if (!resolved.startsWith(storageRoot)) return null;
  if (!fs.existsSync(resolved)) return null;

  const ext = path.extname(resolved).toLowerCase();
  const contentType = ext === ".pdf"
    ? "application/pdf"
    : ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";

  return {
    absolutePath: resolved,
    contentType,
    downloadName: path.basename(resolved),
  };
}

/** mock ファイル（ストレージ実体なし）— 1x1 placeholder PNG */
export function getCustomerProjectFilePlaceholderV1(
  fileId: string
): { buffer: Buffer; contentType: string; downloadName: string } {
  const isPdf = fileId.includes("pdf") || fileId.includes("spec") || fileId.includes("manual");
  if (isPdf) {
    return {
      buffer: Buffer.from(
        "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF",
        "utf8"
      ),
      contentType: "application/pdf",
      downloadName: "document.pdf",
    };
  }
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  return {
    buffer: png1x1,
    contentType: "image/png",
    downloadName: "photo.png",
  };
}

export function clearCustomerProjectFilesCacheV1(): void {
  internalFileIndex.clear();
}

/** テスト用: URL が安全か */
export function assertCustomerFileUrlsSafeV1(files: KnowledgeCustomerProjectFileV1[]): boolean {
  const text = JSON.stringify(files);
  return !/QNAP|SMB|WebDAV|192\.168\.|projectId|project-storage|mock fallback/i.test(text);
}

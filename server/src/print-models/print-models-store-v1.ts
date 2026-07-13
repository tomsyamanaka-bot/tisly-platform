/**
 * Print Models V1 — STL + slice metadata registry for PWA 3D viewer
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface PrintModelSliceMetaV1 {
  printTimeSeconds?: number | null;
  printTimeLabel?: string | null;
  layerCount?: number | null;
  layerHeightMm?: number | null;
  nozzleTempC?: number | null;
  bedTempC?: number | null;
  filamentUsedM?: number | null;
  infillPercent?: number | null;
  nozzleSizeMm?: number | null;
  machineName?: string | null;
  material?: string | null;
  [key: string]: unknown;
}

export interface PrintModelRecordV1 {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stlFileName: string;
  stlSizeBytes: number;
  gcodeFileName: string | null;
  gcodeSizeBytes: number | null;
  slice: PrintModelSliceMetaV1;
  notes: string | null;
  source: string | null;
  stlUrl: string;
  gcodeUrl: string | null;
  metaUrl: string;
}

interface RegistryFileV1 {
  version: 1;
  models: PrintModelRecordV1[];
}

export const PRINT_MODELS_MAX_STL_BYTES = 50 * 1024 * 1024;
export const PRINT_MODELS_MAX_GCODE_BYTES = 80 * 1024 * 1024;

export function getPrintModelsRootV1(): string {
  return (
    process.env.TISLY_PRINT_MODELS_DIR?.trim() ||
    path.join(process.cwd(), "uploads", "print-models")
  );
}

function registryPath(): string {
  return path.join(getPrintModelsRootV1(), "registry.json");
}

function ensureRoot(): void {
  fs.mkdirSync(getPrintModelsRootV1(), { recursive: true });
}

function readRegistry(): RegistryFileV1 {
  ensureRoot();
  const p = registryPath();
  if (!fs.existsSync(p)) return { version: 1, models: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as RegistryFileV1;
    if (!raw || !Array.isArray(raw.models)) return { version: 1, models: [] };
    return { version: 1, models: raw.models };
  } catch {
    return { version: 1, models: [] };
  }
}

function writeRegistry(reg: RegistryFileV1): void {
  ensureRoot();
  fs.writeFileSync(registryPath(), JSON.stringify(reg, null, 2), "utf8");
}

export function formatPrintTimeLabelV1(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return m > 0 ? `${h}時間${m}分` : `${h}時間`;
  }
  if (m > 0) {
    return s > 0 ? `${m}分${s}秒` : `${m}分`;
  }
  return `${s}秒`;
}

export function normalizeSliceMetaV1(raw: unknown): PrintModelSliceMetaV1 {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  const str = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
  };

  const printTimeSeconds = num(src.printTimeSeconds ?? src.print_time_seconds ?? src.timeSeconds);
  const layerCount = num(src.layerCount ?? src.layer_count);
  const layerHeightMm = num(src.layerHeightMm ?? src.layer_height_mm ?? src.layerHeight);
  const nozzleTempC = num(src.nozzleTempC ?? src.nozzle_temp_c ?? src.nozzleTemp);
  const bedTempC = num(src.bedTempC ?? src.bed_temp_c ?? src.bedTemp);
  const filamentUsedM = num(src.filamentUsedM ?? src.filament_used_m);
  const infillPercent = num(src.infillPercent ?? src.infill_percent);
  const nozzleSizeMm = num(src.nozzleSizeMm ?? src.nozzle_size_mm);
  let printTimeLabel = str(src.printTimeLabel ?? src.print_time_label);
  if (!printTimeLabel && printTimeSeconds != null) {
    printTimeLabel = formatPrintTimeLabelV1(printTimeSeconds);
  }

  return {
    ...src,
    printTimeSeconds,
    printTimeLabel,
    layerCount,
    layerHeightMm,
    nozzleTempC,
    bedTempC,
    filamentUsedM,
    infillPercent,
    nozzleSizeMm,
    machineName: str(src.machineName ?? src.machine_name),
    material: str(src.material),
  };
}

function modelUrls(id: string, hasGcode: boolean): Pick<PrintModelRecordV1, "stlUrl" | "gcodeUrl" | "metaUrl"> {
  return {
    stlUrl: `/api/print-models/v1/models/${encodeURIComponent(id)}/stl`,
    gcodeUrl: hasGcode
      ? `/api/print-models/v1/models/${encodeURIComponent(id)}/gcode`
      : null,
    metaUrl: `/api/print-models/v1/models/${encodeURIComponent(id)}`,
  };
}

export function listPrintModelsV1(): PrintModelRecordV1[] {
  return readRegistry().models.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getPrintModelV1(id: string): PrintModelRecordV1 | null {
  return readRegistry().models.find((m) => m.id === id) ?? null;
}

export function getPrintModelFilePathV1(id: string, kind: "stl" | "gcode" | "meta"): string | null {
  const rec = getPrintModelV1(id);
  if (!rec) return null;
  const dir = path.join(getPrintModelsRootV1(), id);
  if (kind === "stl") return path.join(dir, rec.stlFileName);
  if (kind === "gcode") {
    if (!rec.gcodeFileName) return null;
    return path.join(dir, rec.gcodeFileName);
  }
  return path.join(dir, "slice.json");
}

function sanitizeBaseName(name: string): string {
  const stem = path.basename(name).replace(/\.[^.]+$/, "");
  const cleaned = stem.replace(/[^\w\-一-龥ぁ-んァ-ンー]+/g, "_").slice(0, 80);
  return cleaned || "model";
}

function decodeBase64Payload(raw: string): Buffer {
  const cleaned = String(raw).replace(/^data:[^;]+;base64,/i, "").trim();
  return Buffer.from(cleaned, "base64");
}

export interface UpsertPrintModelInputV1 {
  name?: string;
  notes?: string | null;
  source?: string | null;
  slice?: unknown;
  stlFileName?: string;
  stlBase64: string;
  gcodeFileName?: string;
  gcodeBase64?: string | null;
  /** If set, update existing id instead of creating new */
  id?: string;
}

export function upsertPrintModelV1(input: UpsertPrintModelInputV1): PrintModelRecordV1 {
  if (!input.stlBase64) {
    throw new Error("stlBase64 is required");
  }
  const stlBuf = decodeBase64Payload(input.stlBase64);
  if (stlBuf.length === 0) throw new Error("STL payload is empty");
  if (stlBuf.length > PRINT_MODELS_MAX_STL_BYTES) {
    throw new Error(`STL too large (max ${PRINT_MODELS_MAX_STL_BYTES} bytes)`);
  }

  let gcodeBuf: Buffer | null = null;
  if (input.gcodeBase64) {
    gcodeBuf = decodeBase64Payload(input.gcodeBase64);
    if (gcodeBuf.length > PRINT_MODELS_MAX_GCODE_BYTES) {
      throw new Error(`G-code too large (max ${PRINT_MODELS_MAX_GCODE_BYTES} bytes)`);
    }
  }

  const now = new Date().toISOString();
  const reg = readRegistry();
  const existing = input.id ? reg.models.find((m) => m.id === input.id) : undefined;
  const id = existing?.id ?? `pm-${crypto.randomBytes(6).toString("hex")}`;
  const baseName = sanitizeBaseName(input.name || input.stlFileName || existing?.name || "model");
  const stlFileName = `${baseName}.stl`;
  const gcodeFileName = gcodeBuf ? `${baseName}.gcode` : existing?.gcodeFileName ?? null;
  const slice = normalizeSliceMetaV1(input.slice ?? existing?.slice ?? {});

  const dir = path.join(getPrintModelsRootV1(), id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, stlFileName), stlBuf);
  if (gcodeBuf && gcodeFileName) {
    fs.writeFileSync(path.join(dir, gcodeFileName), gcodeBuf);
  }
  fs.writeFileSync(path.join(dir, "slice.json"), JSON.stringify(slice, null, 2), "utf8");

  const record: PrintModelRecordV1 = {
    id,
    name: (input.name || existing?.name || baseName).trim() || baseName,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    stlFileName,
    stlSizeBytes: stlBuf.length,
    gcodeFileName,
    gcodeSizeBytes: gcodeBuf ? gcodeBuf.length : existing?.gcodeSizeBytes ?? null,
    slice,
    notes: input.notes !== undefined ? input.notes : existing?.notes ?? null,
    source: input.source !== undefined ? input.source : existing?.source ?? "automation",
    ...modelUrls(id, Boolean(gcodeFileName)),
  };

  const idx = reg.models.findIndex((m) => m.id === id);
  if (idx >= 0) reg.models[idx] = record;
  else reg.models.push(record);
  writeRegistry(reg);
  return record;
}

export function deletePrintModelV1(id: string): boolean {
  const reg = readRegistry();
  const idx = reg.models.findIndex((m) => m.id === id);
  if (idx < 0) return false;
  reg.models.splice(idx, 1);
  writeRegistry(reg);
  const dir = path.join(getPrintModelsRootV1(), id);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  return true;
}

/** Test helper — wipe registry + files under current root */
export function resetPrintModelsForTestV1(): void {
  const root = getPrintModelsRootV1();
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  ensureRoot();
  writeRegistry({ version: 1, models: [] });
}

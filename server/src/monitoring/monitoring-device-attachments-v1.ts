/** TiSLY Monitoring 3D V3.4 — デバイス別 現調写真 / PDF / Customer 資料紐づけ */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { resolveMonitoringSiteIdV1 } from "./tisly-monitoring-layout-v1.js";

export type MonitoringDeviceAttachmentTypeV1 =
  | "survey_photo"
  | "before_photo"
  | "after_photo"
  | "wiring_photo"
  | "device_photo"
  | "spec_pdf"
  | "completion_report_pdf"
  | "estimate_pdf"
  | "invoice_pdf"
  | "manual_pdf"
  | "customer_knowledge"
  | "site_drawing";

export const MONITORING_DEVICE_ATTACHMENT_TYPES: MonitoringDeviceAttachmentTypeV1[] = [
  "survey_photo",
  "before_photo",
  "after_photo",
  "wiring_photo",
  "device_photo",
  "spec_pdf",
  "completion_report_pdf",
  "estimate_pdf",
  "invoice_pdf",
  "manual_pdf",
  "customer_knowledge",
  "site_drawing",
];

export interface MonitoringDeviceAttachmentV1 {
  attachmentId: string;
  type: MonitoringDeviceAttachmentTypeV1;
  title: string;
  safeLabel: string;
  /** 内部保存パス — API レスポンスでは除外 */
  source: string;
  previewUrl?: string;
  openUrl: string;
  createdAt: string;
  customerVisible: boolean;
  reportVisible: boolean;
}

/** API 向け — source 非公開 */
export type MonitoringDeviceAttachmentPublicV1 = Omit<MonitoringDeviceAttachmentV1, "source">;

export interface MonitoringDeviceAttachmentRecordV1 {
  siteId: string;
  deviceId: string;
  deviceName: string;
  floorLevel: string;
  areaName: string;
  attachments: MonitoringDeviceAttachmentV1[];
}

export interface MonitoringDeviceAttachmentsStoreV1 {
  version: 1;
  updatedAt: string;
  records: MonitoringDeviceAttachmentRecordV1[];
}

function getStorePath(): string {
  const override = process.env.TISLY_MONITORING_DEVICE_ATTACHMENTS_PATH;
  if (override) return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  return path.join(process.cwd(), "data", "monitoring", "device-attachments.json");
}

function sanitizeDeviceId(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
}

function stripInternalPath(source: string): boolean {
  return (
    source.includes("\\") ||
    source.includes("project-storage") ||
    source.includes("uploads/business") ||
    source.startsWith("//") ||
    source.startsWith("\\\\")
  );
}

export function toPublicAttachmentV1(att: MonitoringDeviceAttachmentV1): MonitoringDeviceAttachmentPublicV1 {
  const { source: _source, ...rest } = att;
  return rest;
}

function buildSeedRecords(): MonitoringDeviceAttachmentRecordV1[] {
  const now = new Date().toISOString();
  const photo = (label: string, type: MonitoringDeviceAttachmentTypeV1, opts: Partial<MonitoringDeviceAttachmentV1> = {}) => ({
    attachmentId: `att-${crypto.randomBytes(4).toString("hex")}`,
    type,
    title: label,
    safeLabel: label,
    source: `mock/photos/${label.replace(/\s/g, "-")}.jpg`,
    previewUrl: "/icons/icon-128.png",
    openUrl: "/icons/icon-128.png",
    createdAt: now,
    customerVisible: opts.customerVisible ?? true,
    reportVisible: opts.reportVisible ?? false,
    ...opts,
  });

  const pdf = (
    label: string,
    type: MonitoringDeviceAttachmentTypeV1,
    openUrl: string,
    opts: Partial<MonitoringDeviceAttachmentV1> = {}
  ) => ({
    attachmentId: `att-${crypto.randomBytes(4).toString("hex")}`,
    type,
    title: label,
    safeLabel: label,
    source: `mock/pdfs/${type}.pdf`,
    previewUrl: undefined,
    openUrl,
    createdAt: now,
    customerVisible: opts.customerVisible ?? true,
    reportVisible: opts.reportVisible ?? false,
    ...opts,
  });

  const knowledge = (label: string, kid: string, ref: string) => ({
    attachmentId: `att-${crypto.randomBytes(4).toString("hex")}`,
    type: "customer_knowledge" as const,
    title: label,
    safeLabel: label,
    source: `knowledge/cards/${kid}.json`,
    previewUrl: "/icons/icon-128.png",
    openUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(kid)}&kind=card&ref=${encodeURIComponent(ref)}`,
    createdAt: now,
    customerVisible: true,
    reportVisible: false,
  });

  return [
    {
      siteId: "DEMO-HOME-001",
      deviceId: "frontDoor",
      deviceName: "玄関",
      floorLevel: "1f",
      areaName: "玄関",
      attachments: [
        photo("玄関 現調写真", "survey_photo", { reportVisible: false }),
        photo("施工前 — 玄関", "before_photo", { reportVisible: true }),
        photo("施工後 — 玄関", "after_photo", { reportVisible: true, customerVisible: true }),
        photo("配線 — 玄関ドア", "wiring_photo", { customerVisible: false, reportVisible: false }),
        pdf("仕様書 PDF", "spec_pdf", "/document-viewer-v1.html?projectId=MO-26-0616-001&kind=specification"),
        pdf(
          "完了報告 PDF",
          "completion_report_pdf",
          "/document-viewer-v1.html?projectId=MO-26-0616-001&kind=completion-report"
        ),
        knowledge("ESP32 設定説明", "RP-ESP32-001", "DEMO-HOME-001"),
      ],
    },
    {
      siteId: "DEMO-HOME-001",
      deviceId: "frontGate",
      deviceName: "門扉",
      floorLevel: "perimeter",
      areaName: "門扉",
      attachments: [
        photo("門扉 現調", "survey_photo", { reportVisible: true }),
        photo("施工前 — 門扉", "before_photo", { reportVisible: true }),
        photo("施工後 — 門扉", "after_photo", { reportVisible: true }),
        pdf("取扱説明", "manual_pdf", "/knowledge-customer-document-v1?ref=DEMO-HOME-001&fileId=manual-gate-001"),
      ],
    },
    {
      siteId: "DEMO-HOME-001",
      deviceId: "living",
      deviceName: "リビング",
      floorLevel: "1f",
      areaName: "リビング",
      attachments: [
        photo("リビング 現調", "survey_photo", { reportVisible: false }),
        photo("配線 — リビング", "wiring_photo", { customerVisible: false }),
        pdf("仕様書（リビング）", "spec_pdf", "/document-viewer-v1.html?projectId=MO-26-0616-001&kind=specification"),
        knowledge("回路図説明", "RP-SCHEMATIC-001", "DEMO-HOME-001"),
      ],
    },
    {
      siteId: "DEMO-HOME-001",
      deviceId: "garage",
      deviceName: "ガレージ",
      floorLevel: "perimeter",
      areaName: "ガレージ",
      attachments: [
        photo("ガレージ 施工後", "after_photo", { reportVisible: true }),
        pdf("見積 PDF", "estimate_pdf", "/document-viewer-v1.html?projectId=MO-26-0616-001&kind=estimate", {
          customerVisible: true,
        }),
        pdf("請求 PDF", "invoice_pdf", "/document-viewer-v1.html?projectId=MO-26-0616-001&kind=invoice", {
          customerVisible: false,
        }),
      ],
    },
    {
      siteId: "DEMO-FACTORY-001",
      deviceId: "aggregateYard",
      deviceName: "骨材ヤード",
      floorLevel: "perimeter",
      areaName: "骨材ヤード",
      attachments: [
        photo("骨材ヤード 点検", "device_photo", { reportVisible: true }),
        photo("施工前 — ヤード", "before_photo", { reportVisible: true }),
        knowledge("PLC 自己保持", "PLC-SELF-HOLD-001", "DEMO-FACTORY-001"),
      ],
    },
    {
      siteId: "DEMO-FACTORY-001",
      deviceId: "silo01",
      deviceName: "サイロ",
      floorLevel: "1f",
      areaName: "サイロ",
      attachments: [
        photo("サイロ 点検写真", "device_photo", { reportVisible: true }),
        pdf("設備点検 PDF", "manual_pdf", "/knowledge-customer-document-v1?ref=DEMO-FACTORY-001&fileId=inspection-silo"),
      ],
    },
    {
      siteId: "DEMO-FACTORY-001",
      deviceId: "mixer01",
      deviceName: "ミキサー",
      floorLevel: "1f",
      areaName: "ミキサー",
      attachments: [
        photo("ミキサー 点検", "device_photo", { reportVisible: true }),
        photo("施工後 — ミキサー", "after_photo", { reportVisible: true }),
      ],
    },
    {
      siteId: "DEMO-FACTORY-001",
      deviceId: "conveyor01",
      deviceName: "コンベア",
      floorLevel: "1f",
      areaName: "コンベア",
      attachments: [
        photo("コンベア 写真", "device_photo", { reportVisible: true }),
        knowledge("順序制御", "PLC-SEQUENCE-001", "DEMO-FACTORY-001"),
      ],
    },
    {
      siteId: "DEMO-FACTORY-001",
      deviceId: "shippingGate",
      deviceName: "出荷ゲート",
      floorLevel: "perimeter",
      areaName: "出荷ゲート",
      attachments: [
        photo("出荷ゲート 点検", "device_photo", { reportVisible: true }),
        pdf(
          "完了報告 PDF",
          "completion_report_pdf",
          "/document-viewer-v1.html?projectId=MO-26-0616-001&kind=completion-report"
        ),
      ],
    },
    {
      siteId: "DEMO-FACTORY-001",
      deviceId: "controlRoom",
      deviceName: "操作室",
      floorLevel: "2f",
      areaName: "操作室",
      attachments: [
        photo("操作室 盤写真", "device_photo", { reportVisible: false, customerVisible: true }),
        pdf("設備点検 PDF", "spec_pdf", "/knowledge-customer-document-v1?ref=DEMO-FACTORY-001&fileId=panel-spec"),
        knowledge("PLC 順序制御", "PLC-SEQUENCE-001", "DEMO-FACTORY-001"),
      ],
    },
  ];
}

function readStore(): MonitoringDeviceAttachmentsStoreV1 {
  const filePath = getStorePath();
  try {
    if (!fs.existsSync(filePath)) {
      const seed: MonitoringDeviceAttachmentsStoreV1 = {
        version: 1,
        updatedAt: new Date().toISOString(),
        records: buildSeedRecords(),
      };
      writeStore(seed);
      return seed;
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as MonitoringDeviceAttachmentsStoreV1;
    if (!parsed?.records?.length) {
      const seed = { version: 1 as const, updatedAt: new Date().toISOString(), records: buildSeedRecords() };
      writeStore(seed);
      return seed;
    }
    return parsed;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), records: buildSeedRecords() };
  }
}

function writeStore(store: MonitoringDeviceAttachmentsStoreV1): void {
  const filePath = getStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function listMonitoringDeviceAttachmentsV1(
  siteIdInput: string,
  deviceIdInput?: string
): {
  siteId: string;
  deviceId: string | null;
  records: Array<Omit<MonitoringDeviceAttachmentRecordV1, "attachments"> & { attachments: MonitoringDeviceAttachmentPublicV1[] }>;
} {
  const siteId = resolveMonitoringSiteIdV1(siteIdInput);
  const store = readStore();
  let records = store.records.filter((r) => r.siteId === siteId);

  if (deviceIdInput) {
    const deviceId = sanitizeDeviceId(deviceIdInput);
    records = records.filter((r) => r.deviceId === deviceId);
  }

  return {
    siteId,
    deviceId: deviceIdInput ? sanitizeDeviceId(deviceIdInput) : null,
    records: records.map((r) => ({
      ...r,
      attachments: r.attachments.map(toPublicAttachmentV1),
    })),
  };
}

export function findMonitoringDeviceAttachmentRecordV1(
  siteIdInput: string,
  deviceIdInput: string
): MonitoringDeviceAttachmentRecordV1 | undefined {
  const siteId = resolveMonitoringSiteIdV1(siteIdInput);
  const deviceId = sanitizeDeviceId(deviceIdInput);
  return readStore().records.find((r) => r.siteId === siteId && r.deviceId === deviceId);
}

export interface AddMonitoringDeviceAttachmentInputV1 {
  siteId: string;
  deviceId: string;
  deviceName?: string;
  floorLevel?: string;
  areaName?: string;
  type: MonitoringDeviceAttachmentTypeV1;
  title: string;
  safeLabel?: string;
  source?: string;
  previewUrl?: string;
  openUrl: string;
  customerVisible?: boolean;
  reportVisible?: boolean;
}

export function addMonitoringDeviceAttachmentV1(
  input: AddMonitoringDeviceAttachmentInputV1
): MonitoringDeviceAttachmentPublicV1 | { error: string } {
  const siteId = resolveMonitoringSiteIdV1(input.siteId);
  const deviceId = sanitizeDeviceId(input.deviceId);
  if (!deviceId) return { error: "Invalid deviceId" };
  if (!MONITORING_DEVICE_ATTACHMENT_TYPES.includes(input.type)) return { error: "Invalid attachment type" };
  if (!input.openUrl?.trim()) return { error: "openUrl is required" };

  const store = readStore();
  let record = store.records.find((r) => r.siteId === siteId && r.deviceId === deviceId);
  if (!record) {
    record = {
      siteId,
      deviceId,
      deviceName: input.deviceName?.trim() || deviceId,
      floorLevel: input.floorLevel ?? "1f",
      areaName: input.areaName?.trim() || deviceId,
      attachments: [],
    };
    store.records.push(record);
  }

  const attachment: MonitoringDeviceAttachmentV1 = {
    attachmentId: `att-${crypto.randomBytes(6).toString("hex")}`,
    type: input.type,
    title: input.title.trim(),
    safeLabel: (input.safeLabel ?? input.title).trim(),
    source: input.source?.trim() || `manual/${deviceId}/${input.type}`,
    previewUrl: input.previewUrl,
    openUrl: input.openUrl.trim(),
    createdAt: new Date().toISOString(),
    customerVisible: input.customerVisible ?? true,
    reportVisible: input.reportVisible ?? false,
  };

  if (stripInternalPath(attachment.openUrl)) {
    return { error: "Internal paths are not allowed in openUrl" };
  }

  record.attachments.push(attachment);
  writeStore(store);
  return toPublicAttachmentV1(attachment);
}

export function deleteMonitoringDeviceAttachmentV1(attachmentId: string): { ok: boolean; error?: string } {
  const id = String(attachmentId ?? "").trim();
  if (!id) return { ok: false, error: "attachmentId required" };

  const store = readStore();
  for (const record of store.records) {
    const idx = record.attachments.findIndex((a) => a.attachmentId === id);
    if (idx >= 0) {
      record.attachments.splice(idx, 1);
      writeStore(store);
      return { ok: true };
    }
  }
  return { ok: false, error: "Attachment not found" };
}

export function listPhotoAttachmentsForDeviceV1(siteIdInput: string, deviceIdInput: string) {
  const record = findMonitoringDeviceAttachmentRecordV1(siteIdInput, deviceIdInput);
  if (!record) return [];
  const photoTypes: MonitoringDeviceAttachmentTypeV1[] = [
    "survey_photo",
    "before_photo",
    "after_photo",
    "wiring_photo",
    "device_photo",
  ];
  return record.attachments.filter((a) => photoTypes.includes(a.type));
}

export function resetMonitoringDeviceAttachmentsForTestV1(): void {
  const filePath = getStorePath();
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

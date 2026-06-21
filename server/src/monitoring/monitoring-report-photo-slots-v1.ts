/** TiSLY Monitoring 3D V3.4 — 完了報告書 PDF 用写真スロット（最大6枚） */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { resolveMonitoringSiteIdV1 } from "./tisly-monitoring-layout-v1.js";
import {
  findMonitoringDeviceAttachmentRecordV1,
  toPublicAttachmentV1,
  type MonitoringDeviceAttachmentPublicV1,
} from "./monitoring-device-attachments-v1.js";

export const MONITORING_REPORT_PHOTO_SLOT_MAX = 6;

export interface MonitoringReportPhotoSlotV1 {
  slotId: string;
  siteId: string;
  deviceId: string;
  deviceName: string;
  attachmentId: string;
  safeLabel: string;
  previewUrl: string;
  openUrl: string;
  addedAt: string;
}

export interface MonitoringReportPhotoSlotsSiteV1 {
  siteId: string;
  maxSlots: number;
  layoutNote: string;
  slots: MonitoringReportPhotoSlotV1[];
}

export interface MonitoringReportPhotoSlotsStoreV1 {
  version: 1;
  updatedAt: string;
  sites: Record<string, MonitoringReportPhotoSlotV1[]>;
}

function getStorePath(): string {
  const override = process.env.TISLY_MONITORING_REPORT_PHOTO_SLOTS_PATH;
  if (override) return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  return path.join(process.cwd(), "data", "monitoring", "report-photo-slots.json");
}

function readStore(): MonitoringReportPhotoSlotsStoreV1 {
  const filePath = getStorePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, updatedAt: new Date().toISOString(), sites: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as MonitoringReportPhotoSlotsStoreV1;
    return parsed?.sites ? parsed : { version: 1, updatedAt: new Date().toISOString(), sites: {} };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), sites: {} };
  }
}

function writeStore(store: MonitoringReportPhotoSlotsStoreV1): void {
  const filePath = getStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

const PHOTO_TYPES = new Set([
  "survey_photo",
  "before_photo",
  "after_photo",
  "wiring_photo",
  "device_photo",
]);

export function getMonitoringReportPhotoSlotsV1(siteIdInput: string): MonitoringReportPhotoSlotsSiteV1 {
  const siteId = resolveMonitoringSiteIdV1(siteIdInput);
  const store = readStore();
  return {
    siteId,
    maxSlots: MONITORING_REPORT_PHOTO_SLOT_MAX,
    layoutNote: "完了報告書 PDF — 1ページ2枚×3段（最大6枚）",
    slots: store.sites[siteId] ?? [],
  };
}

export interface AddMonitoringReportPhotoSlotInputV1 {
  siteId: string;
  deviceId: string;
  attachmentId: string;
}

export function addMonitoringReportPhotoSlotV1(
  input: AddMonitoringReportPhotoSlotInputV1
): { ok: true; slot: MonitoringReportPhotoSlotV1; slots: MonitoringReportPhotoSlotV1[] } | { ok: false; error: string } {
  const siteId = resolveMonitoringSiteIdV1(input.siteId);
  const deviceId = String(input.deviceId ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
  const attachmentId = String(input.attachmentId ?? "").trim();
  if (!deviceId || !attachmentId) return { ok: false, error: "deviceId and attachmentId are required" };

  const record = findMonitoringDeviceAttachmentRecordV1(siteId, deviceId);
  if (!record) return { ok: false, error: "Device not found" };

  const attachment = record.attachments.find((a) => a.attachmentId === attachmentId);
  if (!attachment) return { ok: false, error: "Attachment not found" };
  if (!attachment.reportVisible) return { ok: false, error: "Attachment is not reportVisible" };
  if (!PHOTO_TYPES.has(attachment.type)) return { ok: false, error: "Only photo attachments can be added to report slots" };

  const store = readStore();
  if (!store.sites[siteId]) store.sites[siteId] = [];
  const slots = store.sites[siteId];

  if (slots.some((s) => s.attachmentId === attachmentId)) {
    return { ok: false, error: "Attachment already in report slots" };
  }
  if (slots.length >= MONITORING_REPORT_PHOTO_SLOT_MAX) {
    return { ok: false, error: `Maximum ${MONITORING_REPORT_PHOTO_SLOT_MAX} photos allowed` };
  }

  const slot: MonitoringReportPhotoSlotV1 = {
    slotId: `rslot-${crypto.randomBytes(4).toString("hex")}`,
    siteId,
    deviceId,
    deviceName: record.deviceName,
    attachmentId,
    safeLabel: attachment.safeLabel,
    previewUrl: attachment.previewUrl || attachment.openUrl,
    openUrl: attachment.openUrl,
    addedAt: new Date().toISOString(),
  };

  slots.push(slot);
  writeStore(store);
  return { ok: true, slot, slots };
}

export function listReportVisiblePhotoCandidatesV1(
  siteIdInput: string,
  deviceIdInput: string
): MonitoringDeviceAttachmentPublicV1[] {
  const record = findMonitoringDeviceAttachmentRecordV1(siteIdInput, deviceIdInput);
  if (!record) return [];
  return record.attachments
    .filter((a) => a.reportVisible && PHOTO_TYPES.has(a.type))
    .map(toPublicAttachmentV1);
}

export function resetMonitoringReportPhotoSlotsForTestV1(): void {
  const filePath = getStorePath();
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

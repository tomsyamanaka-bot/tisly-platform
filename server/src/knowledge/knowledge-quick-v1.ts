/** TiSLY Knowledge — 現場クイック登録 v1（30秒目標） */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getKnowledgeAttachmentsDir } from "./knowledge-paths-v1.js";
import { saveKnowledgeCardV1 } from "./knowledge-store-v1.js";
import type { KnowledgeCardV1, KnowledgeQuickCaptureInputV1 } from "./knowledge-types.js";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextQuickId(): string {
  const token = Date.now().toString(36).toUpperCase();
  return `QUICK-${token}`;
}

export function captureQuickKnowledgeV1(input: KnowledgeQuickCaptureInputV1): KnowledgeCardV1 {
  const title = String(input.title ?? "").trim() || "現場メモ";
  const memo = String(input.memo ?? "").trim();
  if (!memo && !input.imageBase64) {
    throw new Error("memo or photo is required");
  }

  const files: string[] = [];
  if (input.imageBase64) {
    const ext = path.extname(input.fileName ?? ".jpg") || ".jpg";
    const fileName = `${uuid()}${ext}`;
    const rel = `attachments/${fileName}`;
    const full = path.join(getKnowledgeAttachmentsDir(), fileName);
    fs.writeFileSync(full, Buffer.from(input.imageBase64, "base64"));
    files.push(rel);
  }

  const tags = [...new Set([...(input.tags ?? []), "現場", "クイック登録"])];

  return saveKnowledgeCardV1({
    id: nextQuickId(),
    title,
    category: input.category || "その他",
    tags,
    summary: memo || `${title} — 現場クイック登録`,
    files,
    updatedAt: todayIsoDate(),
    sourceType: "quick",
  });
}

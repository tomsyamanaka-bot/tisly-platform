import type { SpecificationContext } from "./specification-template.js";

const UNWANTED_NOTE_PATTERNS = [
  /Google予定から自動生成/g,
  /\/\s*PWA連携/g,
  /作業時間/g,
  /使用部材/g,
  /確認結果/g,
];

/** 仕様書PDFに載せない文言を除去 */
export function sanitizeSpecificationNotes(notes: string | null | undefined): string {
  if (!notes?.trim()) return "";
  let text = notes.trim();
  for (const pattern of UNWANTED_NOTE_PATTERNS) {
    text = text.replace(pattern, "");
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildSpecificationEquipmentBody(ctx: SpecificationContext): string {
  const parts: string[] = [];
  const equipment = ctx.equipmentList?.trim();
  const ipList = ctx.ipList?.trim();
  if (equipment && equipment !== "—") parts.push(equipment);
  if (ipList && ipList !== "—") {
    parts.push(parts.length ? `【IP設備】\n${ipList}` : ipList);
  }
  return parts.join("\n\n") || "—";
}

export function buildSpecificationWorkContent(ctx: SpecificationContext): string {
  const work = ctx.systemConfig?.trim();
  if (work && work !== "—") return work;
  return "—";
}

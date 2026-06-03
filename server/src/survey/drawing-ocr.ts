import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

/** Placeholder OCR — swap implementation for OpenAI Vision / dedicated OCR later. */
export interface DrawingOcrResult {
  drawingId: string;
  placeholder: true;
  provider: "rule-based-v1";
  floors: string[];
  rooms: string[];
  symbols: string[];
  meta: { fileName: string | null; mimeType: string | null; processedAt: string };
}

export function runDrawingOcr(drawingId: string): DrawingOcrResult {
  const row = getDatabase()
    .prepare(`SELECT id, file_path, file_name, mime_type, project_id FROM survey_drawings WHERE id = ?`)
    .get(drawingId) as
    | { id: string; file_path: string; file_name: string | null; mime_type: string | null; project_id: string }
    | undefined;
  if (!row) throw new Error("drawing not found");
  const full = path.join(process.cwd(), "uploads", "survey", row.file_path);
  if (!fs.existsSync(full)) throw new Error("drawing file missing");

  const result: DrawingOcrResult = {
    drawingId,
    placeholder: true,
    provider: "rule-based-v1",
    floors: ["外周", "1F", "2F"],
    rooms: ["玄関", "廊下", "和室", "洋間", "WC"],
    symbols: ["camera", "beam", "light", "aircon", "panel"],
    meta: {
      fileName: row.file_name,
      mimeType: row.mime_type,
      processedAt: new Date().toISOString(),
    },
  };

  const id = uuid();
  getDatabase()
    .prepare(
      `INSERT INTO survey_drawing_ocr (id, drawing_id, result_json, created_at) VALUES (?, ?, ?, datetime('now'))`
    )
    .run(id, drawingId, JSON.stringify(result));
  return result;
}

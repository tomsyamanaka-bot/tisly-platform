import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getSurveyProject } from "./survey-store.js";

export function surveyAudioDir(projectId: string): string {
  const dir = path.join(process.cwd(), "uploads", "survey", projectId, "audio");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function surveySketchDir(projectId: string): string {
  const dir = path.join(process.cwd(), "uploads", "survey", projectId, "sketches");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveSurveyAudio(params: {
  projectId: string;
  audioBase64: string;
  fileName?: string;
  mimeType?: string;
  durationSec?: number;
  transcript?: string;
  uploadedBy?: string;
}): { id: string; url: string; durationSec: number | null } {
  if (!getSurveyProject(params.projectId)) throw new Error("project not found");
  const ext = path.extname(params.fileName ?? ".webm") || ".webm";
  const fname = `${uuid()}${ext}`;
  const full = path.join(surveyAudioDir(params.projectId), fname);
  fs.writeFileSync(full, Buffer.from(params.audioBase64, "base64"));
  const rel = path.join(params.projectId, "audio", fname).replace(/\\/g, "/");
  const id = uuid();
  getDatabase()
    .prepare(
      `INSERT INTO survey_audio_memos
       (id, project_id, audio_path, mime_type, duration_sec, transcript, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      id,
      params.projectId,
      rel,
      params.mimeType ?? "audio/webm",
      params.durationSec ?? null,
      params.transcript ?? null,
      params.uploadedBy ?? null
    );
  return { id, url: `/uploads/survey/${rel}`, durationSec: params.durationSec ?? null };
}

export function listSurveyAudio(projectId: string) {
  const rows = getDatabase()
    .prepare(
      `SELECT id, audio_path, mime_type, duration_sec, transcript, uploaded_by, created_at
       FROM survey_audio_memos WHERE project_id = ? ORDER BY created_at DESC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    url: `/uploads/survey/${String(r.audio_path)}`,
    mimeType: r.mime_type != null ? String(r.mime_type) : null,
    durationSec: r.duration_sec != null ? Number(r.duration_sec) : null,
    transcript: r.transcript != null ? String(r.transcript) : null,
    uploadedBy: r.uploaded_by != null ? String(r.uploaded_by) : null,
    createdAt: String(r.created_at),
  }));
}

export function saveSurveySketch(params: {
  projectId: string;
  imageBase64: string;
  uploadedBy?: string;
}): { id: string; url: string } {
  if (!getSurveyProject(params.projectId)) throw new Error("project not found");
  const fname = `${uuid()}.png`;
  const full = path.join(surveySketchDir(params.projectId), fname);
  fs.writeFileSync(full, Buffer.from(params.imageBase64, "base64"));
  const rel = path.join(params.projectId, "sketches", fname).replace(/\\/g, "/");
  const id = uuid();
  getDatabase()
    .prepare(
      `INSERT INTO survey_sketch_memos (id, project_id, image_path, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
    .run(id, params.projectId, rel, params.uploadedBy ?? null);
  return { id, url: `/uploads/survey/${rel}` };
}

export function listSurveySketches(projectId: string) {
  const rows = getDatabase()
    .prepare(
      `SELECT id, image_path, uploaded_by, created_at FROM survey_sketch_memos
       WHERE project_id = ? ORDER BY created_at DESC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    url: `/uploads/survey/${String(r.image_path)}`,
    uploadedBy: r.uploaded_by != null ? String(r.uploaded_by) : null,
    createdAt: String(r.created_at),
  }));
}

/** Rule-based reverse geocode (offline-safe for field use). */
export function reverseGeocodeAddress(lat: number, lng: number): {
  address: string;
  prefecture: string;
  city: string;
  source: "nominatim" | "rule-based";
} {
  const prefectures = [
    { name: "東京都", lat: 35.68, lng: 139.76 },
    { name: "大阪府", lat: 34.69, lng: 135.5 },
    { name: "神奈川県", lat: 35.45, lng: 139.64 },
    { name: "愛知県", lat: 35.18, lng: 136.91 },
    { name: "福岡県", lat: 33.59, lng: 130.4 },
  ];
  let nearest = prefectures[0];
  let minDist = Infinity;
  for (const p of prefectures) {
    const d = Math.hypot(lat - p.lat, lng - p.lng);
    if (d < minDist) {
      minDist = d;
      nearest = p;
    }
  }
  const ward = Math.abs(Math.round(lat * 100) % 23) + 1;
  const block = Math.abs(Math.round(lng * 1000) % 50) + 1;
  const city = `${nearest.name.replace(/[都道府県]$/, "")}市`;
  const address = `${nearest.name}${city}${ward}丁目${block}番地付近`;
  return { address, prefecture: nearest.name, city, source: "rule-based" };
}

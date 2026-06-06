import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { listSurveyPhotos, listSurveyDrawings } from "../survey/survey-store.js";
import { PRO_FLOOR_TIERS } from "./floor-map-stack.js";

export interface ProRemoteFieldMediaItem {
  url: string;
  source: "survey" | "install" | "drawing";
  label: string;
  photoType?: string;
}

const PHOTO_TIER_HINT: Record<string, string> = {
  aerial: "perimeter",
  outside: "perimeter",
  inside: "1f",
  route: "1f",
  camera: "perimeter",
  sensor: "1f",
  network: "1f",
  electrical: "1f",
  panel: "1f",
  drawing: "1f",
};

export function buildFieldMediaByTier(customerCode: string): Record<string, ProRemoteFieldMediaItem[]> {
  const customer = getCustomerByCode(customerCode);
  const result: Record<string, ProRemoteFieldMediaItem[]> = {};
  for (const tier of PRO_FLOOR_TIERS) result[tier] = [];
  if (!customer) return result;

  const db = getDatabase();
  const surveyRow = db
    .prepare(
      `SELECT sp.project_id FROM survey_projects sp
       JOIN business_projects bp ON bp.survey_project_id = sp.project_id
       WHERE sp.customer_code = ?
       ORDER BY sp.created_at DESC LIMIT 1`
    )
    .get(customerCode) as { project_id: string } | undefined;

  if (surveyRow) {
    for (const photo of listSurveyPhotos(surveyRow.project_id)) {
      const tier = PHOTO_TIER_HINT[photo.photoType] ?? "1f";
      result[tier]?.push({
        url: `/uploads/survey/${photo.photoPath}`,
        source: "survey",
        label: photo.photoType,
        photoType: photo.photoType,
      });
    }
    for (const drawing of listSurveyDrawings(surveyRow.project_id)) {
      const tier = "1f";
      result[tier]?.push({
        url: `/uploads/survey/${drawing.filePath}`,
        source: "drawing",
        label: drawing.fileName || "図面",
        photoType: "drawing",
      });
    }
  }

  const bizRow = db
    .prepare(
      `SELECT id, construction_photos_json FROM business_projects
       WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(customerCode) as { id: string; construction_photos_json: string | null } | undefined;

  if (bizRow?.construction_photos_json) {
    try {
      const photos = JSON.parse(bizRow.construction_photos_json) as Array<{
        urlPath?: string;
        fileName?: string;
        caption?: string;
      }>;
      for (const p of photos) {
        if (!p.urlPath) continue;
        result["1f"]?.push({
          url: p.urlPath,
          source: "install",
          label: p.caption || p.fileName || "施工写真",
        });
      }
    } catch {
      /* */
    }
  }

  return result;
}

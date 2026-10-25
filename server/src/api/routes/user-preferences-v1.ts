import { Router } from "express";
import {
  readStaffNotifyPreferenceV1,
  saveStaffNotifyPreferenceV1,
} from "../../notification/staff-notify-focus-v1.js";

/** 社内画面のミュートと選択中現場。購読レコードは更新しない。 */
export const userPreferencesRouter = Router();

function preferenceJsonV1(row: {
  enabled: boolean;
  siteId: string;
  activeSiteId?: string;
  propertyId: string;
  updatedAt: string;
  mutedSites?: string[];
  muteBySite?: Record<string, boolean>;
}) {
  return {
    ok: true,
    muteOtherSites: row.enabled,
    activeSiteId: row.activeSiteId || row.siteId,
    siteId: row.siteId,
    propertyId: row.propertyId,
    updatedAt: row.updatedAt,
    mutedSites: row.mutedSites ?? [],
    muteBySite: row.muteBySite ?? {},
  };
}

userPreferencesRouter.get("/preferences", (req, res) => {
  const row = readStaffNotifyPreferenceV1({
    endpoint: String(req.query.endpoint ?? ""),
    userId: String(req.query.userId ?? ""),
    siteId: String(req.query.siteId ?? ""),
    propertyId: String(req.query.propertyId ?? ""),
  });
  res.json(preferenceJsonV1(row));
});

userPreferencesRouter.post("/preferences", (req, res) => {
  try {
    const saved = saveStaffNotifyPreferenceV1({
      endpoint: req.body?.endpoint,
      userId: req.body?.userId,
      enabled: req.body?.enabled,
      muteOtherSites: req.body?.muteOtherSites,
      siteId: req.body?.siteId,
      activeSiteId: req.body?.activeSiteId,
      propertyId: req.body?.propertyId,
      muteBySite: req.body?.muteBySite,
      mutedSites: req.body?.mutedSites,
    });
    res.json(preferenceJsonV1(saved));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: message });
  }
});

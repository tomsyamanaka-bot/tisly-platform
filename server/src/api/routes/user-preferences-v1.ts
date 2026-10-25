import { Router } from "express";
import {
  readStaffNotifyPreferenceV1,
  saveStaffNotifyPreferenceV1,
} from "../../notification/staff-notify-focus-v1.js";

/** 社内画面のミュートと選択中現場。購読レコードは更新しない。 */
export const userPreferencesRouter = Router();

userPreferencesRouter.get("/preferences", (req, res) => {
  const row = readStaffNotifyPreferenceV1({
    endpoint: String(req.query.endpoint ?? ""),
    userId: String(req.query.userId ?? ""),
  });
  res.json({
    ok: true,
    muteOtherSites: row.enabled,
    activeSiteId: row.siteId,
    propertyId: row.propertyId,
    updatedAt: row.updatedAt,
  });
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
    });
    res.json({
      ok: true,
      muteOtherSites: saved.enabled,
      activeSiteId: saved.siteId,
      propertyId: saved.propertyId,
      updatedAt: saved.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: message });
  }
});

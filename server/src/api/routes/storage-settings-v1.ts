import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { canChangeCustomerSettings } from "../../auth/roles.js";
import {
  getStorageSettingsV1,
  getStorageStatusSummary,
  toPublicStorageSettings,
  updateStorageSettingsV1,
} from "../../storage/storage-settings-store.js";
import {
  runQnapConnectionTest,
  runQnapTestPdfSend,
} from "../../storage/qnap-storage-service.js";
import {
  resyncAllQnapPdfMismatchesV1,
  runQnapPdfIntegrityCheckV1,
} from "../../storage/qnap-pdf-integrity-service.js";

export const storageSettingsV1Router = Router();

const adminAuth = [requireAuth("admin")] as const;

function assertAdminRole(req: AuthedRequest, res: Response): boolean {
  const role = req.admin?.role ?? "viewer";
  if (!canChangeCustomerSettings(role) && role !== "super_admin") {
    res.status(403).json({ error: "管理者権限が必要です" });
    return false;
  }
  return true;
}

storageSettingsV1Router.get("/", ...adminAuth, (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;
  const settings = getStorageSettingsV1();
  const summary = getStorageStatusSummary(settings);
  res.json({
    settings: toPublicStorageSettings(settings),
    summary,
  });
});

storageSettingsV1Router.put("/", ...adminAuth, (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;
  const body = req.body ?? {};
  const qnapBody = body.qnap ?? {};
  const next = updateStorageSettingsV1({
    localStorageEnabled: body.localStorageEnabled,
    qnapBackupEnabled: body.qnapBackupEnabled,
    qnap: {
      host: qnapBody.host,
      port: qnapBody.port,
      shareName: qnapBody.shareName,
      username: qnapBody.username,
      password: qnapBody.password,
    },
  });
  const summary = getStorageStatusSummary(next);
  res.json({
    ok: true,
    settings: toPublicStorageSettings(next),
    summary,
  });
});

storageSettingsV1Router.post("/qnap/test-connection", ...adminAuth, async (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;
  const result = await runQnapConnectionTest();
  const settings = getStorageSettingsV1();
  res.json({
    ok: result.ok,
    result,
    summary: getStorageStatusSummary(settings),
  });
});

storageSettingsV1Router.post("/qnap/test-pdf", ...adminAuth, async (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;
  const result = await runQnapTestPdfSend();
  const settings = getStorageSettingsV1();
  res.json({
    ok: result.ok,
    result,
    summary: getStorageStatusSummary(settings),
  });
});

storageSettingsV1Router.get("/qnap/integrity", ...adminAuth, (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;
  res.json(runQnapPdfIntegrityCheckV1());
});

storageSettingsV1Router.post("/qnap/integrity/resync", ...adminAuth, async (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;
  const integrity = runQnapPdfIntegrityCheckV1();
  const result = await resyncAllQnapPdfMismatchesV1();
  res.json({
    ok: true,
    integrity,
    result,
    refreshed: runQnapPdfIntegrityCheckV1(),
  });
});

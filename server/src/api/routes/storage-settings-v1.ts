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
  runQnapTestPdfDelete,
  runQnapTestPdfSend,
} from "../../storage/qnap-storage-service.js";
import { getQnapStorageHealthV1 } from "../../storage/qnap-storage-v1-config.js";
import { retryFailedQnapStorageV1 } from "../../storage/qnap-storage-v1-service.js";
import {
  resyncAllQnapPdfMismatchesV1,
  runQnapPdfIntegrityCheckV1,
} from "../../storage/qnap-pdf-integrity-service.js";
import { runQnapSpecPhotosIntegrityCheckV1 } from "../../storage/qnap-spec-photos-integrity-service.js";

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
    qnapHealth: getQnapStorageHealthV1(),
  });
});

storageSettingsV1Router.post("/qnap/test-delete", ...adminAuth, async (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;
  const result = await runQnapTestPdfDelete();
  const settings = getStorageSettingsV1();
  res.json({
    ok: result.ok,
    result,
    summary: getStorageStatusSummary(settings),
    qnapHealth: getQnapStorageHealthV1(),
  });
});

storageSettingsV1Router.get("/qnap/status", ...adminAuth, (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;
  const settings = getStorageSettingsV1();
  res.json({
    ...getQnapStorageHealthV1(),
    summary: getStorageStatusSummary(settings),
    lastTestPdfSend: settings.lastTestPdfSend ?? null,
    lastTestPdfDelete: settings.lastTestPdfDelete ?? null,
    testFileName: "Test/tisly-test.pdf",
  });
});

storageSettingsV1Router.post("/qnap/retry-failed", ...adminAuth, async (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;
  const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
  try {
    const result = await retryFailedQnapStorageV1(projectId);
    res.json({ ok: true, result, qnapHealth: getQnapStorageHealthV1() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "retry failed" });
  }
});

storageSettingsV1Router.get("/qnap/integrity", ...adminAuth, (req: AuthedRequest, res) => {
  if (!assertAdminRole(req, res)) return;
  const projectId = String(req.query.projectId ?? "").trim() || undefined;
  res.json({
    pdfs: runQnapPdfIntegrityCheckV1(),
    specPhotos: runQnapSpecPhotosIntegrityCheckV1(projectId),
  });
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

/**
 * 見積一覧 QNAP保存（実機 WebDAV）+ 白ベース×紺色 UI v1
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it, before } from "node:test";

process.env.JWT_SECRET = "test-jwt-navy-qnap-list-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-navy-qnap-list-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
// 一覧保存はモック不可 — テストでは未設定エラーを検証
delete process.env.QNAP_STORAGE_MOCK;
delete process.env.QNAP_STORAGE_FORCE_REAL;
delete process.env.QNAP_WEBDAV_URL;
delete process.env.QNAP_HOST;
delete process.env.QNAP_USERNAME;
delete process.env.QNAP_PASSWORD;
delete process.env.QNAP_WEBDAV_USER;
delete process.env.QNAP_WEBDAV_PASSWORD;

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  invoicesEstimatesMonthFolderV1,
  buildInvoicesEstimatesBackupRelativePathV1,
} = await import("../src/storage/mothership-paths-v1.js");

// dotenv override 対策
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-navy-qnap-list-v1.db";
delete process.env.QNAP_STORAGE_MOCK;
delete process.env.QNAP_STORAGE_FORCE_REAL;
delete process.env.QNAP_WEBDAV_URL;
delete process.env.QNAP_WEBDAV_USER;
delete process.env.QNAP_WEBDAV_PASSWORD;

const publicDir = path.join(process.cwd(), "public");
const app = createApp();

function read(rel: string) {
  return fs.readFileSync(path.join(publicDir, rel), "utf-8");
}

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: "TOMS001",
      username: "toms001.surveyor",
      password: "demo-remote-2026",
    });
}

describe("白ベース×紺色 UI + 見積一覧 QNAP実機保存 v1", () => {
  let token = "";

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.TISLY_DB_PATH = "./data/test-navy-qnap-list-v1.db";
    delete process.env.QNAP_STORAGE_MOCK;
    delete process.env.QNAP_STORAGE_FORCE_REAL;
    delete process.env.QNAP_WEBDAV_URL;
    delete process.env.QNAP_WEBDAV_USER;
    delete process.env.QNAP_WEBDAV_PASSWORD;
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await surveyorLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;
  });

  it("navy tokens are appended to light theme css", () => {
    const css = read("css/tisly-neon-dark-v1.css");
    assert.match(css, /--tisly-neon-bg:\s*#ffffff/);
    assert.match(css, /--tisly-navy:\s*#1e3a8a/);
    assert.match(css, /白ベース × 紺色リニューアル/);
    const friendly = read("css/tisly-friendly-ui.css");
    assert.match(friendly, /--tisly-navy:\s*#1e3a8a/);
    assert.match(friendly, /data-action="qnap-save"/);
    assert.match(friendly, /color:\s*#1e3a8a/);
    assert.match(friendly, /\.toast\.toast-success/);
    assert.match(friendly, /background:\s*#15803d/);
  });

  it("estimate list uses VPS proxy only (no browser direct fallback)", () => {
    const js = read("js/estimate-v1.js");
    assert.match(js, /listCardActionsHtml/);
    assert.match(js, /data-action="qnap-save"/);
    assert.match(js, /saveListProjectToQnap/);
    assert.match(js, /qnap-save-invoices-estimates/);
    assert.match(js, /qnapSaveSuccessToastMessage/);
    assert.match(js, /qnapSaveFeedbackMessage/);
    assert.match(js, /documentNasSaveSuccessMessage/);
    assert.match(js, /DOCUMENT_NAS_HOST/);
    assert.match(js, /projectHasQnapSaveEligible/);
    assert.match(js, /projectHasEstimateReady/);
    assert.match(js, /見積書の準備ができました/);
    assert.match(js, /VPS プロキシのみ/);
    assert.match(js, /documentNasPdfSaveRequestSentMessage/);
    assert.match(js, /nastoms へ保存要求を送信しました|documentNasPdfSaveRequestSentMessage/);
    assert.match(js, /asyncStarted/);
    assert.match(js, /AbortSignal\.timeout\(15_000\)/);
    assert.match(js, /VPSから nastoms への接続がタイムアウトしました/);
    assert.match(js, /QNAP認証エラー: ストレージ設定画面で QNAP \(nastoms\) のログインパスワードを確認・入力してください/);
    assert.doesNotMatch(js, /saveProjectPdfsViaLocalWebDav/);
    assert.doesNotMatch(js, /shouldTryClientDirectFallback/);
    assert.doesNotMatch(js, /ローカルWi-Fi経由で再試行/);
    assert.doesNotMatch(js, /localStorage\.clear/);

    const direct = read("js/qnap-client-direct-v1.js");
    assert.match(direct, /DOCUMENT_NAS_NAME = "nastoms"/);
    assert.match(direct, /DOCUMENT_NAS_HOST = "192\.168\.1\.134"/);
    assert.match(direct, /DOCUMENT_NAS_DEFAULT_PORT = 8080/);
    assert.match(direct, /DOCUMENT_NAS_FALLBACK_PORTS = \[8080, 5005, 5006, 5000\]/);
    assert.match(direct, /resolveLocalWebDavWithPortFallback/);
    assert.match(direct, /listDocumentNasPortCandidates/);
    assert.match(direct, /shouldTryClientDirectFallback/);
    assert.match(direct, /return false/);
    assert.match(direct, /VPS プロキシのみ/);
    assert.match(direct, /documentNasSaveSuccessMessage/);
    assert.match(direct, /documentNasConnectSuccessMessage/);
    assert.match(direct, /への接続に成功しました/);
    assert.match(direct, /User-Agent.*TiSLY-PWA|TiSLY-PWA/);
    assert.match(direct, /Translate/);
    assert.match(direct, /PROPFIND/);
    assert.match(direct, /mapWebDavHttpStatus/);
    assert.match(
      direct,
      /QNAP認証エラー: ストレージ設定画面で QNAP \(nastoms\) のログインパスワードを確認・入力してください/
    );
    assert.match(
      direct,
      /保存先の共有フォルダ（例: \/Invoices_Estimates\/）が存在しません/
    );
    assert.match(direct, /formatDocumentNasSaveDest/);
    assert.match(direct, /tisly_qnap_local_host_v1/);
    assert.match(direct, /tisly_qnap_local_port_v3/);
  });

  it("save module uses multi-route fallback and pending sync", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/storage/estimate-invoice-qnap-save-v1.ts"),
      "utf-8"
    );
    assert.match(src, /resolveRealQnapWebDavForListSave/);
    assert.match(src, /uploadOneReal/);
    assert.match(src, /getQnapWebDavEnvConfig/);
    assert.match(src, /resolveQnapBasicAuthCredentials/);
    assert.match(src, /envWebDav\.webdavUrl/);
    assert.match(src, /QNAP_DEFAULT_BASIC_USER/);
    assert.match(src, /probeVpsToQnapConnection/);
    assert.match(src, /formatVpsToQnapProxyError/);
    assert.match(src, /proxyRoute/);
    assert.match(src, /resolveQnapSaveCredentialsV1/);
    assert.match(src, /uploadEstimateInvoiceWithFallbackV1/);
    assert.match(src, /enqueueEstimateInvoiceQnapPendingV1/);
    assert.match(src, /pendingSync/);
    assert.match(src, /documentNasPdfSaveSuccessMessage/);
    assert.match(src, /documentNasPdfSavePendingMessage/);
    assert.match(src, /NOT_CONFIGURED/);
    assert.doesNotMatch(src, /qnap-storage-mock/);
    assert.doesNotMatch(src, /QNAP MOCK/);
    assert.doesNotMatch(src, /isQnapStorageMockMode/);
  });

  it("fallback routes prefer 8080 then 5005/5006 File Station MagicDNS and LAN", async () => {
    const {
      listQnapFallbackRoutesV1,
      DOCUMENT_NAS_TAILSCALE_HOST_DEFAULT,
    } = await import("../src/storage/estimate-invoice-qnap-fallback-routes-v1.js");
    const routes = listQnapFallbackRoutesV1({
      tailscaleHost: "100.99.31.120",
      lanHost: "192.168.1.134",
    });
    assert.equal(DOCUMENT_NAS_TAILSCALE_HOST_DEFAULT, "100.99.31.120");
    assert.equal(routes[0].kind, "webdav_http_8080");
    assert.match(String(routes[0].webdavUrl), /100\.99\.31\.120:8080/);
    assert.equal(routes[1].kind, "file_station_8080");
    assert.match(
      String(routes[1].fileStationUrl),
      /100\.99\.31\.120:8080\/cgi-bin\/filemanager\/utilRequest\.cgi/
    );
    assert.equal(routes[2].kind, "webdav_http_5005");
    assert.match(String(routes[2].webdavUrl), /100\.99\.31\.120:5005/);
    assert.equal(routes[3].kind, "webdav_https_5006");
    assert.match(String(routes[3].webdavUrl), /100\.99\.31\.120:5006/);
    assert.ok(routes.some((r) => r.kind === "webdav_magic_dns_8080"));
    assert.equal(routes[routes.length - 2].kind, "webdav_lan_8080");
    assert.match(String(routes[routes.length - 2].webdavUrl), /192\.168\.1\.134:8080/);
    assert.equal(routes[routes.length - 1].kind, "local_pending");
  });

  it("pending store enqueues and lists items", async () => {
    const {
      enqueueEstimateInvoiceQnapPendingV1,
      listEstimateInvoiceQnapPendingV1,
      markEstimateInvoiceQnapPendingV1,
      countEstimateInvoiceQnapPendingV1,
    } = await import("../src/storage/estimate-invoice-qnap-pending-store-v1.js");
    const item = enqueueEstimateInvoiceQnapPendingV1({
      projectId: "test-pending-proj-1",
      files: [
        {
          kind: "estimate",
          localPath: "/tmp/estimate.pdf",
          remotePath: "Invoices_Estimates/2026-08/estimate.pdf",
          displayPath: "/TiSLY/Invoices_Estimates/2026-08/estimate.pdf",
        },
      ],
      lastError: "all routes refused",
    });
    assert.ok(item.id);
    assert.equal(item.status, "pending");
    assert.ok(countEstimateInvoiceQnapPendingV1() >= 1);
    const listed = listEstimateInvoiceQnapPendingV1(10);
    assert.ok(listed.some((i) => i.id === item.id));
    markEstimateInvoiceQnapPendingV1(item.id, { status: "success" });
    assert.ok(!listEstimateInvoiceQnapPendingV1(50).some((i) => i.id === item.id));
  });

  it("estimate list toast messages cover success and pending sync", () => {
    const js = read("js/estimate-v1.js");
    const direct = read("js/qnap-client-direct-v1.js");
    assert.match(js, /documentNasSaveSuccessMessage/);
    assert.match(js, /documentNasPdfSaveSuccessMessage/);
    assert.match(js, /documentNasPdfSavePendingMessage/);
    assert.match(js, /pendingSync/);
    assert.match(js, /への保存が完了しました/);
    assert.match(js, /showQnapSaveDoneToast/);
    assert.match(js, /toast-success/);
    assert.match(direct, /への保存が完了しました/);
    assert.match(direct, /一時保存完了（QNAPへ自動同期待ち）/);
    assert.match(direct, /documentNasPdfSavePendingMessage/);
  });

  it("resolve prefers QNAP_WEBDAV_URL over empty settings", async () => {
    const prevUrl = process.env.QNAP_WEBDAV_URL;
    const prevUser = process.env.QNAP_WEBDAV_USER;
    const prevPass = process.env.QNAP_WEBDAV_PASSWORD;
    process.env.QNAP_WEBDAV_URL = "https://100.99.31.10:5006/TiSLY";
    process.env.QNAP_WEBDAV_USER = "tisly";
    process.env.QNAP_WEBDAV_PASSWORD = "secret";
    delete process.env.QNAP_USER;
    try {
      const { resolveRealQnapWebDavForListSave } = await import(
        "../src/storage/estimate-invoice-qnap-save-v1.js"
      );
      const cfg = resolveRealQnapWebDavForListSave({
        localStorageEnabled: true,
        qnapBackupEnabled: false,
        qnap: {
          host: "192.168.1.99",
          port: 8080,
          shareName: "TiSLY",
          username: "old",
          password: "oldpass",
        },
      } as never);
      assert.ok(cfg);
      assert.equal(cfg!.mode, "real");
      assert.match(cfg!.webdavUrl, /100\.99\.31\.10/);
      assert.equal(cfg!.username, "tisly");
    } finally {
      if (prevUrl === undefined) delete process.env.QNAP_WEBDAV_URL;
      else process.env.QNAP_WEBDAV_URL = prevUrl;
      if (prevUser === undefined) delete process.env.QNAP_WEBDAV_USER;
      else process.env.QNAP_WEBDAV_USER = prevUser;
      if (prevPass === undefined) delete process.env.QNAP_WEBDAV_PASSWORD;
      else process.env.QNAP_WEBDAV_PASSWORD = prevPass;
    }
  });

  it("mothership path builds Invoices_Estimates/YYYY-MM under /TiSLY", () => {
    const month = invoicesEstimatesMonthFolderV1(new Date("2026-08-01T00:00:00+09:00"));
    assert.equal(month, "2026-08");
    const rel = buildInvoicesEstimatesBackupRelativePathV1(
      "invoice-TEST.pdf",
      new Date("2026-08-01T00:00:00+09:00")
    );
    assert.equal(
      rel,
      "Invoices_Estimates/2026-08/invoice-TEST.pdf"
    );
  });

  it("path roots include /TiSLY and /Public/TiSLY absolute paths", async () => {
    const {
      listInvoiceEstimatePathCandidatesV1,
      shouldFallbackToPublicTislyV1,
      resolveRemoteRelForWebDavBaseV1,
    } = await import("../src/storage/estimate-invoice-qnap-path-roots-v1.js");
    const {
      buildInvoicesEstimatesAbsolutePathV1,
    } = await import("../src/storage/mothership-paths-v1.js");
    const date = new Date("2026-08-01T00:00:00+09:00");
    assert.equal(
      buildInvoicesEstimatesAbsolutePathV1("見積書_ティーエス生コン.pdf", date),
      "/TiSLY/Invoices_Estimates/2026-08/見積書_ティーエス生コン.pdf"
    );
    assert.equal(
      buildInvoicesEstimatesAbsolutePathV1("見積書_ティーエス生コン.pdf", date, "public_tisly"),
      "/Public/TiSLY/Invoices_Estimates/2026-08/見積書_ティーエス生コン.pdf"
    );
    const cands = listInvoiceEstimatePathCandidatesV1(
      "invoice-TEST.pdf",
      "http://100.99.31.120:5005/TiSLY",
      date
    );
    assert.equal(cands[0].kind, "tisly");
    assert.equal(cands[0].remoteRel, "Invoices_Estimates/2026-08/invoice-TEST.pdf");
    assert.equal(cands[1].kind, "public_tisly");
    assert.match(cands[1].remoteRel, /Public\/TiSLY\/Invoices_Estimates/);
    assert.equal(
      resolveRemoteRelForWebDavBaseV1(
        "http://192.168.1.134:8080/",
        "a.pdf",
        "tisly",
        date
      ),
      "TiSLY/Invoices_Estimates/2026-08/a.pdf"
    );
    assert.equal(shouldFallbackToPublicTislyV1(403), true);
    assert.equal(shouldFallbackToPublicTislyV1(404), true);
    assert.equal(shouldFallbackToPublicTislyV1("MKCOL x failed: HTTP 403"), true);
    assert.equal(shouldFallbackToPublicTislyV1("書き込み権限エラー"), true);
    assert.equal(shouldFallbackToPublicTislyV1(500), false);
    const { rewriteWebDavBaseForPublicTislyV1 } = await import(
      "../src/storage/estimate-invoice-qnap-path-roots-v1.js"
    );
    assert.equal(
      rewriteWebDavBaseForPublicTislyV1("http://100.99.31.120:5005/TiSLY"),
      "http://100.99.31.120:5005/Public"
    );
  });

  it("mkcol recursive and uploadLocalFiles return steps", async () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/business/services/qnapWebDav.ts"),
      "utf-8"
    );
    assert.match(src, /async mkcol\(remoteDir/);
    assert.match(src, /isWebDavMkcolSuccessStatus/);
    assert.match(src, /mkcolSteps/);
    assert.match(src, /steps\.push/);
    const fallbackSrc = fs.readFileSync(
      path.join(process.cwd(), "src/storage/estimate-invoice-qnap-fallback-routes-v1.ts"),
      "utf-8"
    );
    assert.match(fallbackSrc, /shouldFallbackToPublicTislyV1/);
    assert.match(fallbackSrc, /public_tisly/);
    assert.match(fallbackSrc, /savedAbsolutePaths/);
    assert.match(fallbackSrc, /MKCOL/);
  });

  it("qnap-save rejects missing project", async () => {
    const res = await request(app)
      .post("/api/estimate/v1/projects/nonexistent-id/qnap-save-invoices-estimates")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 404);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.mock, false);
  });

  it("qnap-save returns immediately with asyncStarted and jobId", async () => {
    const {
      documentNasPdfSaveAcceptedMessage,
      documentNasPdfSaveRequestSentMessage,
    } = await import("../src/storage/qnap-nas-hosts-v1.js");
    assert.equal(
      documentNasPdfSaveAcceptedMessage(),
      "QNAPへの保存処理を開始しました（キュー保存完了）"
    );
    assert.equal(
      documentNasPdfSaveRequestSentMessage(),
      "nastoms へ保存要求を送信しました"
    );

    const fetchSrc = fs.readFileSync(
      path.join(process.cwd(), "src/business/services/qnap-webdav-fetch-v1.ts"),
      "utf-8"
    );
    assert.match(fetchSrc, /QNAP_WEBDAV_TIMEOUT_MS \|\| "3000"/);
    assert.match(fetchSrc, /AbortController/);

    const routeSrc = fs.readFileSync(
      path.join(process.cwd(), "src/api/routes/estimate-v1.ts"),
      "utf-8"
    );
    assert.match(routeSrc, /asyncStarted:\s*true/);
    assert.match(routeSrc, /documentNasPdfSaveAcceptedMessage/);
    assert.match(routeSrc, /createEstimateInvoiceQnapJobV1/);
    assert.match(routeSrc, /jobId: job\.id/);
    assert.match(routeSrc, /projects\/qnap-jobs/);
    assert.match(routeSrc, /qnap-save-jobs/);
    assert.match(routeSrc, /void saveEstimateInvoicePdfsToQnapV1/);

    const js = read("js/estimate-v1.js");
    assert.match(js, /pollQnapSaveJobAndToast/);
    assert.match(js, /formatQnapSaveDoneToast/);
    assert.match(js, /projects\/qnap-jobs/);
    assert.match(js, /maxAttempts = 10/);
    assert.match(js, /delayMs = 1000/);
    assert.match(js, /savedAbsolutePaths/);
  });

  it("service worker bumps qnap job poll toast cache", () => {
    const sw = read("service-worker.js");
    assert.match(sw, /tisly-pwa-v2437-qnap-job-poll-toast/);
  });

  it("storage settings exposes save debug logs UI and API", () => {
    const html = read("storage-settings-v1.html");
    assert.match(html, /qnap-save-debug-list/);
    assert.match(html, /QNAP 保存デバッグログ/);
    const js = read("js/storage-settings-v1.js");
    assert.match(js, /loadSaveDebugLogs/);
    assert.match(js, /save-debug-logs/);
    const routeSrc = fs.readFileSync(
      path.join(process.cwd(), "src/api/routes/storage-settings-v1.ts"),
      "utf-8"
    );
    assert.match(routeSrc, /listQnapSaveDebugLogsV1/);
    assert.match(routeSrc, /\/qnap\/save-debug-logs/);
  });

  it("formatVpsToQnapProxyError builds timeout and auth messages", async () => {
    const {
      formatVpsToQnapProxyError,
      documentNasSaveSuccessMessage,
      documentNasPdfSaveSuccessMessage,
      documentNasPdfSavePendingMessage,
    } = await import("../src/storage/qnap-nas-hosts-v1.js");
    const timeoutMsg = formatVpsToQnapProxyError(
      "192.168.1.134",
      8080,
      "ETIMEDOUT"
    );
    assert.equal(
      timeoutMsg,
      "VPSから nastoms への接続がタイムアウトしました。Tailscale / LAN接続状態を確認してください"
    );
    const authMsg = formatVpsToQnapProxyError(
      "192.168.1.134",
      8080,
      "401 Unauthorized"
    );
    assert.equal(
      authMsg,
      "QNAP認証エラー: ストレージ設定画面で QNAP (nastoms) のログインパスワードを確認・入力してください"
    );
    assert.equal(
      documentNasSaveSuccessMessage("192.168.1.134", 5005, "Invoices_Estimates"),
      "nastoms への保存が完了しました（Invoices_Estimates）"
    );
    assert.equal(
      documentNasPdfSaveSuccessMessage(),
      "nastoms への保存が完了しました"
    );
    assert.equal(
      documentNasPdfSaveSuccessMessage([
        "/Public/TiSLY/Invoices_Estimates/2026-08/見積書.pdf",
      ]),
      "nastoms への保存が完了しました（/Public/TiSLY/Invoices_Estimates/2026-08/見積書.pdf）"
    );
    assert.equal(
      documentNasPdfSavePendingMessage(),
      "一時保存完了（QNAPへ自動同期待ち）"
    );
    const refusedMsg = formatVpsToQnapProxyError(
      "100.99.31.120",
      5006,
      "ECONNREFUSED"
    );
    assert.equal(
      refusedMsg,
      "QNAP (100.99.31.120) の WebDAV サービスが有効になっているか、QNAPコントロールパネルをご確認ください"
    );
  });

  it("css and estimate js are served", async () => {
    const jsBody = read("js/estimate-v1.js");
    assert.match(jsBody, /saveListProjectToQnap/);
    assert.match(jsBody, /projectHasQnapSaveEligible/);

    const css = await request(app).get("/css/tisly-neon-dark-v1.css");
    assert.equal(css.status, 200);
    assert.match(css.text, /#1e3a8a/);

    const js = await request(app).get("/js/estimate-v1.js");
    assert.equal(js.status, 200);
    assert.match(js.text, /saveListProjectToQnap/);
    assert.match(js.text, /projectHasQnapSaveEligible/);
  });
});

/**
 * Tailscale VPN 復旧後の QNAP 保存フラグ・
 * WebDAV タイムアウト既定値の回帰。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { storageStatusPresentation } from "../src/storage/storage-documents-v1-store.js";
import http from "node:http";
import { extractQnapAuthSidV1, parseQnapAuthLoginHintV1 } from "../src/storage/qnap-file-station-client-v1.js";
import {
  documentNasPdfSaveSuccessMessage,
  isLikelyNonWebDavPort,
  resolveDocumentNasLocalPort,
} from "../src/storage/qnap-nas-hosts-v1.js";
import { qnapWebDavFetch } from "../src/business/services/qnap-webdav-fetch-v1.js";

describe("qnap-vpn-recovery-v1", () => {
  it("WebDAV default timeout is 12000ms", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/business/services/qnap-webdav-fetch-v1.ts"
      ),
      "utf8"
    );
    assert.match(src, /QNAP_WEBDAV_TIMEOUT_MS \|\| "12000"/);
  });

  it("synced storage presents 🟢 保存済 equivalent", () => {
    const pres = storageStatusPresentation("qnap_synced", true);
    assert.equal(pres.icon, "🟢");
    assert.match(pres.label, /QNAP保存済/);
    const toast = documentNasPdfSaveSuccessMessage(
      "/TiSLY/Invoices_Estimates/probe.txt"
    );
    assert.match(toast, /保存が完了/);
  });

  it("extracts File Station SID from CDATA XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<QDocRoot>
  <authPassed><![CDATA[1]]></authPassed>
  <authSid><![CDATA[abcSID123]]></authSid>
</QDocRoot>`;
    assert.equal(extractQnapAuthSidV1(xml), "abcSID123");
    const failXml = `<?xml version="1.0" encoding="UTF-8" ?>
<QDocRoot>
  <authPassed><![CDATA[0]]></authPassed>
  <errorValue><![CDATA[-1]]></errorValue>
</QDocRoot>`;
    const hint = parseQnapAuthLoginHintV1(failXml);
    assert.equal(hint.authPassed, "0");
    assert.equal(hint.errorValue, "-1");
    assert.equal(hint.sid, null);
  });

  it("ignores SSH-like QNAP_LOCAL_PORT 5522", () => {
    const prevLocal = process.env.QNAP_LOCAL_PORT;
    const prevPort = process.env.QNAP_PORT;
    process.env.QNAP_LOCAL_PORT = "5522";
    delete process.env.QNAP_PORT;
    try {
      assert.equal(isLikelyNonWebDavPort(5522), true);
      assert.equal(resolveDocumentNasLocalPort(null), 8080);
    } finally {
      if (prevLocal === undefined) delete process.env.QNAP_LOCAL_PORT;
      else process.env.QNAP_LOCAL_PORT = prevLocal;
      if (prevPort === undefined) delete process.env.QNAP_PORT;
      else process.env.QNAP_PORT = prevPort;
    }
  });

  it("PUT 200 from local WebDAV maps to 🟢 saved flag", async () => {
    const server = http.createServer((req, res) => {
      if (req.method === "PUT") {
        req.resume();
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
        });
        return;
      }
      res.writeHead(405);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    try {
      const url = `http://127.0.0.1:${addr.port}/TiSLY/Invoices_Estimates/probe.txt`;
      const res = await qnapWebDavFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: "TiSLY VPN probe\nstatus=QNAP_SAVED_GREEN\n",
      });
      assert.equal(res.status, 200);
      const pres = storageStatusPresentation("qnap_synced", true);
      assert.equal(pres.icon, "🟢");
      assert.match(pres.label, /QNAP保存済/);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  it("probe script never embeds secrets", () => {
    const script = fs.readFileSync(
      path.join(
        process.cwd(),
        "../scripts/qnap-tailscale-probe-v1.py"
      ),
      "utf8"
    );
    assert.doesNotMatch(script, /tskey-auth-/);
    assert.doesNotMatch(script, /QNAP_WEBDAV_PASSWORD\s*=\s*"/);
    assert.match(script, /E2E_SAVE_FLAG/);
  });
});

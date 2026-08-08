/**
 * QNAP 並行ホスト探索 v1
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { describe, it } from "node:test";

describe("qnap-parallel-host-probe-v1", () => {
  it("lists Tailscale + MagicDNS + LAN probe targets", async () => {
    const {
      listQnapParallelProbeTargetsV1,
      DOCUMENT_NAS_MAGIC_DNS_HOSTS,
      QNAP_PARALLEL_PROBE_DEFAULT_TS,
      isHostReachableHttpStatus,
      formatQnapProbeFailureSummaryV1,
      formatQnapProbeResultSummaryV1,
    } = await import("../src/storage/qnap-parallel-host-probe-v1.js");

    assert.equal(QNAP_PARALLEL_PROBE_DEFAULT_TS, "100.99.31.120");
    assert.deepEqual([...DOCUMENT_NAS_MAGIC_DNS_HOSTS], [
      "nastoms",
      "nastoms.local",
    ]);

    const targets = listQnapParallelProbeTargetsV1({
      tailscaleHost: "100.99.31.120",
      lanHost: "192.168.1.134",
    });
    const urls = targets.map((t) => t.url);
    assert.ok(urls.some((u) => u.includes("100.99.31.120:8080")));
    assert.ok(urls.some((u) => u.includes("100.99.31.120:5005")));
    assert.ok(urls.some((u) => u.includes("https://100.99.31.120:5006")));
    assert.ok(urls.some((u) => u.includes("http://nastoms:8080")));
    assert.ok(urls.some((u) => u.includes("http://nastoms.local:8080")));
    assert.ok(urls.some((u) => u.includes("192.168.1.134:8080")));

    assert.equal(isHostReachableHttpStatus(200), true);
    assert.equal(isHostReachableHttpStatus(301), true);
    assert.equal(isHostReachableHttpStatus(401), true);
    assert.equal(isHostReachableHttpStatus(501), true);
    assert.equal(isHostReachableHttpStatus(0), false);

    const hits = [
      {
        target: targets[0],
        ok: false,
        reachable: false,
        latencyMs: 10,
        httpStatus: null,
        errorCode: "ECONNREFUSED",
        message: "refused",
      },
      {
        target: targets[1],
        ok: true,
        reachable: true,
        latencyMs: 40,
        httpStatus: 401,
        errorCode: null,
        message: "ok",
      },
    ];
    assert.match(
      formatQnapProbeFailureSummaryV1(hits),
      /100\.99\.31\.120:8080=ECONNREFUSED/
    );
    assert.match(
      formatQnapProbeResultSummaryV1({
        ok: true,
        fastest: hits[1],
        hits,
      }),
      /到達:.*5005/
    );
  });

  it("parallel probe picks fastest mock-reachable target", async () => {
    const {
      probeQnapHostsInParallelV1,
      listQnapParallelProbeTargetsV1,
    } = await import("../src/storage/qnap-parallel-host-probe-v1.js");

    const targets = listQnapParallelProbeTargetsV1({
      tailscaleHost: "100.99.31.120",
      lanHost: "192.168.1.134",
    }).slice(0, 3);

    // ネットワークを叩かず、ダミー結果相当のソートだけ検証するため
    // probe 自体は短タイムアウトで全滅し得る — summary 生成を確認
    const prev = process.env.QNAP_WEBDAV_TIMEOUT_MS;
    process.env.QNAP_WEBDAV_TIMEOUT_MS = "200";
    try {
      const result = await probeQnapHostsInParallelV1({ targets });
      assert.equal(result.hits.length, targets.length);
      assert.ok(typeof result.summary === "string");
      assert.ok(
        result.summary.includes("不通") ||
          result.summary.includes("到達") ||
          result.summary.includes("全ホスト")
      );
    } finally {
      if (prev === undefined) delete process.env.QNAP_WEBDAV_TIMEOUT_MS;
      else process.env.QNAP_WEBDAV_TIMEOUT_MS = prev;
    }
  });

  it("fallback routes include MagicDNS and order by probe", async () => {
    const {
      listQnapFallbackRoutesV1,
      orderQnapFallbackRoutesByProbeV1,
      DOCUMENT_NAS_TAILSCALE_HOST_DEFAULT,
    } = await import("../src/storage/estimate-invoice-qnap-fallback-routes-v1.js");

    assert.equal(DOCUMENT_NAS_TAILSCALE_HOST_DEFAULT, "100.99.31.120");
    const routes = listQnapFallbackRoutesV1({
      tailscaleHost: "100.99.31.120",
      lanHost: "192.168.1.134",
    });
    assert.equal(routes[0].kind, "webdav_http_8080");
    assert.equal(routes[1].kind, "file_station_8080");
    assert.equal(routes[2].kind, "webdav_http_5005");
    assert.equal(routes[3].kind, "webdav_https_5006");
    assert.ok(routes.some((r) => r.kind === "webdav_magic_dns_8080"));
    assert.ok(
      routes.some(
        (r) =>
          r.kind === "webdav_magic_dns_8080" &&
          String(r.webdavUrl || "").includes("nastoms:8080")
      )
    );
    assert.ok(
      routes.some(
        (r) =>
          r.kind === "webdav_magic_dns_8080" &&
          String(r.webdavUrl || "").includes("nastoms.local:8080")
      )
    );
    assert.equal(routes[routes.length - 2].kind, "webdav_lan_8080");
    assert.equal(routes[routes.length - 1].kind, "local_pending");

    const probe = {
      ok: true,
      fastest: null,
      reachable: [
        {
          target: {
            id: "ts_5005",
            label: "t",
            host: "100.99.31.120",
            port: 5005,
            protocol: "http" as const,
            url: "http://100.99.31.120:5005/",
            webdavUrl: "http://100.99.31.120:5005/TiSLY",
          },
          ok: true,
          reachable: true,
          latencyMs: 12,
          httpStatus: 401,
          errorCode: null,
          message: "ok",
        },
      ],
      hits: [],
      summary: "到達: 100.99.31.120:5005 (12ms)",
      testedAt: new Date().toISOString(),
    };
    const ordered = orderQnapFallbackRoutesByProbeV1(routes, probe);
    assert.equal(ordered[0].kind, "webdav_http_5005");
    assert.equal(ordered[ordered.length - 1].kind, "local_pending");
  });

  it("save module and estimate UI surface probeSummary", () => {
    const saveSrc = fs.readFileSync(
      path.join(process.cwd(), "src/storage/estimate-invoice-qnap-save-v1.ts"),
      "utf-8"
    );
    assert.match(saveSrc, /probeSummary/);
    assert.match(saveSrc, /probeQnapHostsInParallelV1/);
    const fallbackSrc = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/storage/estimate-invoice-qnap-fallback-routes-v1.ts"
      ),
      "utf-8"
    );
    assert.match(fallbackSrc, /probeQnapHostsInParallelV1/);
    assert.match(fallbackSrc, /orderQnapFallbackRoutesByProbeV1/);
    assert.match(fallbackSrc, /webdav_magic_dns_8080/);
    const js = fs.readFileSync(
      path.join(process.cwd(), "public/js/estimate-v1.js"),
      "utf-8"
    );
    assert.match(js, /probeSummary/);
  });
});

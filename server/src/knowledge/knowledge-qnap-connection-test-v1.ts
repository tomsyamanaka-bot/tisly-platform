/** Knowledge Field UX V5 — QNAP WebDAV 接続確認（認証情報はログに出さない） */

import fs from "fs";
import path from "path";
import {
  getKnowledgeQnapDeliveryConfigV1,
  type KnowledgeQnapDeliveryModeV1,
} from "./knowledge-qnap-delivery-config-v1.js";
import { getKnowledgeDataRoot } from "./knowledge-paths-v1.js";
import { maskWebDavUrlPreview } from "../storage/qnap-storage-v1-config.js";
import { buildStorageProviderConfig } from "../storage/qnap-storage-v1-config.js";
import { WebDavStorageProvider } from "../storage/providers/webdav-storage-provider.js";

export interface KnowledgeQnapSampleListResultV1 {
  ok: boolean;
  count: number;
  sample: string[];
  source: "mock_local" | "webdav" | "none";
}

export interface KnowledgeQnapConnectionTestV1 {
  mode: KnowledgeQnapDeliveryModeV1;
  configured: boolean;
  reachable: boolean;
  baseUrl: string;
  shareRoot: string;
  checkedAt: string;
  fallbackReason?: string;
  sampleListResult: KnowledgeQnapSampleListResultV1;
  errorMessage?: string;
}

function listMockKnowledgeSamples(limit = 5): KnowledgeQnapSampleListResultV1 {
  const root = getKnowledgeDataRoot();
  const samples: string[] = [];
  for (const sub of ["KnowledgeCards", "3DPrint", "PLC"]) {
    const dir = path.join(root, sub);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (samples.length >= limit) break;
      samples.push(`${sub}/${file}`);
    }
    if (samples.length >= limit) break;
  }
  return {
    ok: samples.length > 0,
    count: samples.length,
    sample: samples,
    source: "mock_local",
  };
}

async function listWebDavSamples(shareRoot: string): Promise<KnowledgeQnapSampleListResultV1> {
  try {
    const provider = new WebDavStorageProvider(buildStorageProviderConfig("webdav"));
    const relBase = shareRoot.replace(/^\/+|\/+$/g, "");
    const probePath = relBase ? `${relBase}/AI/KnowledgeCards` : "AI/KnowledgeCards";
    const exists = await provider.exists(probePath);
    if (!exists) {
      return { ok: true, count: 0, sample: ["AI/KnowledgeCards (未確認)"], source: "webdav" };
    }
    return {
      ok: true,
      count: 1,
      sample: ["AI/KnowledgeCards"],
      source: "webdav",
    };
  } catch {
    return { ok: false, count: 0, sample: [], source: "webdav" };
  }
}

/** GET /api/knowledge/qnap-connection-test の本体 — 失敗しても throw しない */
export async function runKnowledgeQnapConnectionTestV1(): Promise<KnowledgeQnapConnectionTestV1> {
  const checkedAt = new Date().toISOString();
  const cfg = getKnowledgeQnapDeliveryConfigV1();
  const baseUrl = cfg.webdavBaseUrl
    ? maskWebDavUrlPreview(cfg.webdavBaseUrl)
    : "(未設定)";

  if (cfg.effectiveMode === "mock") {
    const isRequestedWebDav = cfg.qnapMode === "webdav";
    return {
      mode: "mock",
      configured: isRequestedWebDav ? cfg.webdavConfigured : true,
      reachable: true,
      baseUrl,
      shareRoot: cfg.shareRoot,
      checkedAt,
      fallbackReason: cfg.fallbackReason,
      sampleListResult: listMockKnowledgeSamples(),
      errorMessage: isRequestedWebDav && cfg.fallbackReason ? "WebDAV 未設定のため mock 運用" : undefined,
    };
  }

  if (!cfg.webdavConfigured) {
    return {
      mode: "webdav",
      configured: false,
      reachable: false,
      baseUrl,
      shareRoot: cfg.shareRoot,
      checkedAt,
      fallbackReason: "WebDAV 認証情報または URL が未設定",
      sampleListResult: { ok: false, count: 0, sample: [], source: "none" },
      errorMessage: "QNAP WebDAV 環境変数が未設定です",
    };
  }

  try {
    const provider = new WebDavStorageProvider(buildStorageProviderConfig("webdav"));
    const test = await provider.testConnection();
    const sampleListResult = test.ok
      ? await listWebDavSamples(cfg.shareRoot)
      : { ok: false, count: 0, sample: [], source: "webdav" as const };

    return {
      mode: "webdav",
      configured: true,
      reachable: test.ok,
      baseUrl,
      shareRoot: cfg.shareRoot,
      checkedAt,
      fallbackReason: test.ok ? undefined : "WebDAV 接続テスト失敗 — local/mock 配信を継続",
      sampleListResult,
      errorMessage: test.ok ? undefined : test.message,
    };
  } catch (e) {
    return {
      mode: "webdav",
      configured: true,
      reachable: false,
      baseUrl,
      shareRoot: cfg.shareRoot,
      checkedAt,
      fallbackReason: "WebDAV 接続例外 — local/mock 配信を継続",
      sampleListResult: { ok: false, count: 0, sample: [], source: "webdav" },
      errorMessage: e instanceof Error ? e.message : "接続テスト失敗",
    };
  }
}

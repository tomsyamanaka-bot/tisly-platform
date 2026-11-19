/**
 * 全物件共通の RP2350 基準を末尾追記する。
 * 既存カードは消さない。
 */

import type {
  KnowledgeCardInputV1,
  KnowledgeCardV1,
} from "./knowledge-types.js";
import {
  getKnowledgeCardV1,
  loadKnowledgeSearchIndexV1,
  rebuildKnowledgeSearchIndexV1,
  saveKnowledgeCardV1,
} from "./knowledge-store-v1.js";

export const RP2350_BASELINE_MODULE_SEED_IDS = [
  "kn-seed-rp2350-baseline-001",
] as const;

export const RP2350_BASELINE_CARD_IDS = [
  "OPS-RP2350-BASELINE-001",
] as const;

const TITLE =
  "【TiSLY標準仕様】RP2350 全物件共通・統一ベースライン（JST固定・Stream OTA・物理安全・自己診断・出荷鉄則）";

const SUMMARY =
  "豊島邸（1.2.67）および板橋自宅（1.6.12）で実戦検証済みの全物件共通標準。JST固定化、WDT対策＆ロールバック付きStream OTA、起動時全DO遮断＆最大通電リミッター、Uptime/OTA再起動識別、点検中モード連動通知、および出荷前USB抜去＋PoE単体緑点滅確認の鉄則をまとめた基準仕様。";

const TAGS = [
  "#TiSLY標準",
  "#RP2350",
  "#OTA",
  "#フェイルセーフ",
  "#キッティング",
  "#全物件標準",
  "#TiSLY_Core",
];

const BODY = [
  "昼夜は UTC に 32400 秒を 1 回足す。",
  "9時間は基板の時計へ書き戻さない。",
  "OTA は ota_engine=stream。",
  "config.py は配らない。",
  "受信の待ちは 4 秒。前後で WDT を給餌する。",
  "置換の直前に .ota_reboot を書く。",
  "起動理由が OTA更新なら WDT 回数に入れない。",
  "通信の前に DO1〜DO8 を 0 にする。",
  "電気錠は 5 秒、警報は 180 秒、ライトは 600 秒。",
  "遠近の DO1 と DO2 はスライダー秒で消し、",
  "点滅の終わりも 0 に戻す。",
  "フラッシュは別の秒数。",
  "心拍は 0 秒と 5 分。稼働秒と起動理由と盤内温度。",
  "稼働秒が戻ったときだけ再起動を数える。",
  "24時間に WDT が 3 回で社内へ警告する。",
  "点検は 30分、2時間、4時間。",
  "同じ DI は 45 秒。10分10回で施主を止め、社内へ出す。",
  "55℃は注意、65℃は社内警報。",
  "社内の通常通知は板橋自宅だけ常時。",
  "他現場は点検中か作業タイマーのあいだだけ。",
  "通信断と高温は別枠。同じ端末の顧客購読は1本にまとめる。",
  "新規出荷は事務所で最新版を USB で1回書く。",
  "USB を抜き、PoE だけで緑点滅と OTA 疎通を見てから持ち出す。",
  "新規現場の実機は templates/rp2350_standard_main.py から始める。",
  "稼働中の豊島邸、板橋自宅、龍ヶ崎店へは上書きしない。",
].join("\n");

export function getRp2350BaselineModuleSeedItemsV1() {
  return [
    {
      id: RP2350_BASELINE_MODULE_SEED_IDS[0],
      title: TITLE,
      summary: SUMMARY,
      body: BODY,
      genre: "IOT関連",
      tags: [...TAGS],
      pdf_url: null,
      createdAt: "2026-11-19T12:20:00.000Z",
    },
  ];
}

export function getRp2350BaselineCardSeedInputsV1(): KnowledgeCardInputV1[] {
  return [
    {
      id: RP2350_BASELINE_CARD_IDS[0],
      title: TITLE,
      category: "IOT関連",
      tags: [...TAGS],
      summary: `${SUMMARY}\n\n${BODY}`,
      body: BODY,
      files: [],
      updatedAt: "2026-11-19",
      sourceType: "manual",
      qnapSyncStatus: "pending",
    },
  ];
}

export function seedRp2350BaselineKnowledgeCardsV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  for (const input of getRp2350BaselineCardSeedInputsV1()) {
    const existing = getKnowledgeCardV1(input.id!);
    if (
      existing &&
      existing.title === input.title &&
      existing.summary === input.summary &&
      existing.body === input.body &&
      JSON.stringify(existing.tags) === JSON.stringify(input.tags)
    ) {
      continue;
    }
    created.push(saveKnowledgeCardV1(input, { skipQnapQueue: true }));
  }
  const index = loadKnowledgeSearchIndexV1();
  const indexed = new Set(index.entries.map((entry) => entry.id));
  const missing = RP2350_BASELINE_CARD_IDS.some((id) => !indexed.has(id));
  if (created.length > 0 || missing) {
    rebuildKnowledgeSearchIndexV1();
  }
  return created;
}

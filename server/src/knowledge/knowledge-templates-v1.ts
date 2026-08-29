/** TiSLY Knowledge — PLC / RP テンプレート v1 */

import fs from "fs";
import path from "path";
import { getKnowledgeFolderPath } from "./knowledge-paths-v1.js";
import { getKnowledgeCardV1, saveKnowledgeCardV1 } from "./knowledge-store-v1.js";
import {
  PLC_TEMPLATE_META_V1,
  PLC_TEMPLATE_TOPICS_V1,
  RP_TEMPLATE_TOPICS_V1,
  type KnowledgeCardV1,
} from "./knowledge-types.js";
import { seedFabFinishKnowledgeCardsV1 } from "./knowledge-fab-finish-seed-v1.js";
import { seedEcoWaterPhKnowledgeCardsV1 } from "./knowledge-eco-water-ph-seed-v1.js";
import { seedEcoWaterFieldKnowledgeCardsV1 } from "./knowledge-eco-water-field-seed-v1.js";
import { seedSecurityFloorKnowledgeCardsV1 } from "./knowledge-security-floor-seed-v1.js";
import { seedOpsInsightKnowledgeCardsV1 } from "./knowledge-ops-insight-seed-v1.js";
import { seedSecurityStreamKnowledgeCardsV1 } from "./knowledge-security-stream-seed-v1.js";
import { seedVoiceCallKnowledgeCardsV1 } from "./knowledge-voice-call-seed-v1.js";
import { seedFactoryStlKnowledgeCardsV1 } from "./knowledge-factory-stl-seed-v1.js";
import { seedRevopointScanKnowledgeCardsV1 } from "./knowledge-revopoint-scan-seed-v1.js";
import { seedHybrid3dStoreKnowledgeCardsV1 } from "./knowledge-hybrid-3d-store-seed-v1.js";
import { seedParametric3dKnowledgeCardsV1 } from "./knowledge-parametric-3d-seed-v1.js";
import { seedFactoryDxPart1KnowledgeCardsV1 } from "./knowledge-factory-dx-part1-seed-v1.js";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const PLC_TOPIC_SLUG: Record<(typeof PLC_TEMPLATE_TOPICS_V1)[number], string> = {
  自己保持: "SELF-HOLD",
  非常停止: "E-STOP",
  点滅: "BLINK",
  タイマー: "TIMER",
  インターロック: "INTERLOCK",
  順序制御: "SEQUENCE",
};

const RP_TOPIC_SLUG: Record<(typeof RP_TEMPLATE_TOPICS_V1)[number], string> = {
  RP2350: "RP2350",
  ESP32: "ESP32",
  配線例: "WIRING",
  回路図: "SCHEMATIC",
  設定例: "CONFIG",
};

function buildPlcSummary(topic: (typeof PLC_TEMPLATE_TOPICS_V1)[number]): string {
  const meta = PLC_TEMPLATE_META_V1[topic];
  return [
    `PLC ${topic} の GX Works3 向け標準テンプレート。`,
    `ラダー: ${meta.ladder}`,
    `用途: ${meta.usage}`,
    `注意点: ${meta.cautions}`,
  ].join("\n");
}

function buildLadderMarkdown(topic: (typeof PLC_TEMPLATE_TOPICS_V1)[number], slug: string): string {
  const meta = PLC_TEMPLATE_META_V1[topic];
  return `# PLC ${topic} — GX Works3 テンプレート

## ラダー説明
${meta.ladder}

## 用途
${meta.usage}

## 注意点
${meta.cautions}

## 関連ファイル
- Ladder/${slug.toLowerCase()}-template.md
- PLC/Templates/（MotherShip 同期）

TiSLY Knowledge — keyword search v1
`;
}

function ensureTemplatePlaceholder(folder: "PLC" | "RP" | "Ladder", fileName: string, content?: string): void {
  const dir = getKnowledgeFolderPath(folder === "Ladder" ? "Ladder" : folder);
  const filePath = path.join(dir, fileName);
  if (!fs.existsSync(filePath) || content) {
    fs.writeFileSync(filePath, content ?? `# ${fileName}\n\nTiSLY Knowledge template placeholder.\n`, "utf8");
  }
}

export function seedPlcKnowledgeTemplatesV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  PLC_TEMPLATE_TOPICS_V1.forEach((topic) => {
    const slug = PLC_TOPIC_SLUG[topic];
    const id = `PLC-${slug}-001`;
    const fileName = `${slug.toLowerCase()}-template.md`;
    const summary = buildPlcSummary(topic);
    ensureTemplatePlaceholder("Ladder", fileName, buildLadderMarkdown(topic, slug));

    const existing = getKnowledgeCardV1(id);
    if (existing) {
      if (!existing.summary.includes("用途:") || !existing.summary.includes("ラダー:")) {
        saveKnowledgeCardV1({
          ...existing,
          summary,
          tags: [...new Set([...(existing.tags ?? []), "PLC", topic, "テンプレート", "GX Works3"])],
          updatedAt: todayIsoDate(),
        });
      }
      return;
    }

    created.push(
      saveKnowledgeCardV1({
        id,
        title: `PLC ${topic}`,
        category: "PLC",
        tags: ["PLC", topic, "テンプレート", "GX Works3"],
        summary,
        files: [`Ladder/${fileName}`],
        updatedAt: todayIsoDate(),
        sourceType: "plc-template",
      })
    );
  });
  return created;
}

export function seedRpKnowledgeTemplatesV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  RP_TEMPLATE_TOPICS_V1.forEach((topic) => {
    const slug = RP_TOPIC_SLUG[topic];
    const id = `RP-${slug}-001`;
    if (getKnowledgeCardV1(id)) return;
    const fileName = `${slug.toLowerCase()}-example.md`;
    ensureTemplatePlaceholder("RP", fileName);
    created.push(
      saveKnowledgeCardV1({
        id,
        title: `${topic} ナレッジ`,
        category: "TiSLY",
        tags: ["RP", "ESP", topic, "PlatformIO"],
        summary: `${topic} の配線・設定・回路図ナレッジ。RP2350 / ESP 系テンプレート。`,
        files: [`RP/${fileName}`],
        updatedAt: todayIsoDate(),
        sourceType: "rp-template",
      })
    );
  });
  return created;
}

export function ensureKnowledgeLibraryTemplatesV1(): {
  plcCreated: number;
  rpCreated: number;
  fabFinishCreated: number;
  ecoWaterPhCreated: number;
  ecoWaterFieldCreated: number;
  securityFloorCreated: number;
  opsInsightCreated: number;
  securityStreamCreated: number;
  voiceCallCreated: number;
  factoryStlCreated: number;
  revopointScanCreated: number;
  hybrid3dStoreCreated: number;
  parametric3dCreated: number;
  factoryDxPart1Created: number;
} {
  const plc = seedPlcKnowledgeTemplatesV1();
  const rp = seedRpKnowledgeTemplatesV1();
  const fab = seedFabFinishKnowledgeCardsV1();
  const ecoWaterPh = seedEcoWaterPhKnowledgeCardsV1();
  const ecoWaterField = seedEcoWaterFieldKnowledgeCardsV1();
  const securityFloor = seedSecurityFloorKnowledgeCardsV1();
  const opsInsight = seedOpsInsightKnowledgeCardsV1();
  const securityStream = seedSecurityStreamKnowledgeCardsV1();
  const voiceCall = seedVoiceCallKnowledgeCardsV1();
  const factoryStl = seedFactoryStlKnowledgeCardsV1();
  const revopointScan = seedRevopointScanKnowledgeCardsV1();
  const hybrid3dStore = seedHybrid3dStoreKnowledgeCardsV1();
  const parametric3d = seedParametric3dKnowledgeCardsV1();
  const factoryDxPart1 = seedFactoryDxPart1KnowledgeCardsV1();
  return {
    plcCreated: plc.length,
    rpCreated: rp.length,
    fabFinishCreated: fab.length,
    ecoWaterPhCreated: ecoWaterPh.length,
    ecoWaterFieldCreated: ecoWaterField.length,
    securityFloorCreated: securityFloor.length,
    opsInsightCreated: opsInsight.length,
    securityStreamCreated: securityStream.length,
    voiceCallCreated: voiceCall.length,
    factoryStlCreated: factoryStl.length,
    revopointScanCreated: revopointScan.length,
    hybrid3dStoreCreated: hybrid3dStore.length,
    parametric3dCreated: parametric3d.length,
    factoryDxPart1Created: factoryDxPart1.length,
  };
}

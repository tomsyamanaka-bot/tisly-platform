/** TiSLY Knowledge — PLC / RP テンプレート v1 */

import fs from "fs";
import path from "path";
import { getKnowledgeFolderPath } from "./knowledge-paths-v1.js";
import { getKnowledgeCardV1, saveKnowledgeCardV1 } from "./knowledge-store-v1.js";
import {
  PLC_TEMPLATE_TOPICS_V1,
  RP_TEMPLATE_TOPICS_V1,
  type KnowledgeCardV1,
} from "./knowledge-types.js";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const PLC_TOPIC_SLUG: Record<(typeof PLC_TEMPLATE_TOPICS_V1)[number], string> = {
  自己保持: "SELF-HOLD",
  非常停止: "E-STOP",
  点滅: "BLINK",
  タイマー: "TIMER",
  インターロック: "INTERLOCK",
};

const RP_TOPIC_SLUG: Record<(typeof RP_TEMPLATE_TOPICS_V1)[number], string> = {
  RP2350: "RP2350",
  ESP32: "ESP32",
  配線例: "WIRING",
  回路図: "SCHEMATIC",
  設定例: "CONFIG",
};

function ensureTemplatePlaceholder(folder: "PLC" | "RP" | "Ladder", fileName: string): void {
  const dir = getKnowledgeFolderPath(folder === "Ladder" ? "Ladder" : folder);
  const filePath = path.join(dir, fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# ${fileName}\n\nTiSLY Knowledge template placeholder.\n`, "utf8");
  }
}

export function seedPlcKnowledgeTemplatesV1(): KnowledgeCardV1[] {
  const created: KnowledgeCardV1[] = [];
  PLC_TEMPLATE_TOPICS_V1.forEach((topic, idx) => {
    const slug = PLC_TOPIC_SLUG[topic];
    const id = `PLC-${slug}-001`;
    if (getKnowledgeCardV1(id)) return;
    const fileName = `${slug.toLowerCase()}-template.md`;
    ensureTemplatePlaceholder("Ladder", fileName);
    created.push(
      saveKnowledgeCardV1({
        id,
        title: `PLC ${topic}`,
        category: "PLC",
        tags: ["PLC", topic, "テンプレート", "GX Works3"],
        summary: `PLC ${topic} の標準テンプレート。将来 GX Works3 部品ライブラリ化予定。`,
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
} {
  const plc = seedPlcKnowledgeTemplatesV1();
  const rp = seedRpKnowledgeTemplatesV1();
  return { plcCreated: plc.length, rpCreated: rp.length };
}

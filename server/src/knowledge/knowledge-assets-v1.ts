/** TiSLY Knowledge Automation Engine v1 — PLC / 3DPrint / Factory 資産管理 */

import fs from "fs";
import path from "path";
import {
  FACTORY_ASSET_SUBFOLDERS_V1,
  PLC_ASSET_SUBFOLDERS_V1,
  THREEDPRINT_ASSET_SUBFOLDERS_V1,
  type FactoryAssetSubfolderV1,
  type KnowledgeAssetRecordV1,
  type PlcAssetSubfolderV1,
  type ThreeDPrintAssetSubfolderV1,
  type KnowledgeCandidateV1,
} from "./knowledge-automation-types.js";
import { getKnowledgeDataRoot, ensureKnowledgeFolderStructure } from "./knowledge-paths-v1.js";
import {
  buildMothershipFactoryRelativePath,
  buildMothershipPlcRelativePath,
  buildMothership3DPrintAssetRelativePath,
} from "../storage/mothership-paths-v1.js";
import { saveKnowledgeCandidateV1 } from "./knowledge-candidates-store-v1.js";

function assetsRegistryPath(): string {
  ensureKnowledgeFolderStructure();
  const dir = path.join(getKnowledgeDataRoot(), "Assets");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "registry.json");
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function readRegistry(): KnowledgeAssetRecordV1[] {
  try {
    const raw = fs.readFileSync(assetsRegistryPath(), "utf8");
    const parsed = JSON.parse(raw) as { assets?: KnowledgeAssetRecordV1[] };
    return parsed.assets ?? [];
  } catch {
    return [];
  }
}

function writeRegistry(assets: KnowledgeAssetRecordV1[]): void {
  fs.writeFileSync(
    assetsRegistryPath(),
    `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), assets }, null, 2)}\n`,
    "utf8"
  );
}

function ensureLocalAssetDirs(): void {
  ensureKnowledgeFolderStructure();
  const root = getKnowledgeDataRoot();
  for (const sub of PLC_ASSET_SUBFOLDERS_V1) {
    fs.mkdirSync(path.join(root, "PLC", sub), { recursive: true });
  }
  for (const sub of THREEDPRINT_ASSET_SUBFOLDERS_V1) {
    fs.mkdirSync(path.join(root, "3DPrint", sub), { recursive: true });
  }
  for (const sub of FACTORY_ASSET_SUBFOLDERS_V1) {
    fs.mkdirSync(path.join(root, "Factory", sub), { recursive: true });
  }
}

function safeId(prefix: string, name: string): string {
  const slug = name
    .replace(/[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .toUpperCase();
  return `${prefix}-${slug || "ASSET"}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

function inferFileFormats(fileName: string): string[] {
  const ext = path.extname(fileName).replace(".", "").toUpperCase();
  return ext ? [ext] : [];
}

export function listKnowledgeAssetsV1(filter?: {
  domain?: KnowledgeAssetRecordV1["domain"];
  projectNo?: string;
}): KnowledgeAssetRecordV1[] {
  ensureLocalAssetDirs();
  let assets = readRegistry();
  if (filter?.domain) assets = assets.filter((a) => a.domain === filter.domain);
  if (filter?.projectNo) assets = assets.filter((a) => a.projectNo === filter.projectNo);
  return assets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function registerKnowledgeAssetV1(input: {
  domain: KnowledgeAssetRecordV1["domain"];
  subFolder: string;
  fileName: string;
  title: string;
  category: string;
  tags?: string[];
  summary: string;
  projectNo?: string;
  projectId?: string;
  ladderDescription?: string;
  createPlaceholder?: boolean;
}): { asset: KnowledgeAssetRecordV1; candidate: KnowledgeCandidateV1 } {
  ensureLocalAssetDirs();
  const domain = input.domain;
  let relativePath = "";

  if (domain === "PLC") {
    relativePath = buildMothershipPlcRelativePath(
      input.subFolder as PlcAssetSubfolderV1,
      input.fileName
    );
  } else if (domain === "3DPrint") {
    relativePath = buildMothership3DPrintAssetRelativePath(
      input.subFolder as ThreeDPrintAssetSubfolderV1,
      input.fileName
    );
  } else {
    relativePath = buildMothershipFactoryRelativePath(
      input.subFolder as FactoryAssetSubfolderV1,
      input.fileName
    );
  }

  const localSubDir =
    domain === "PLC" ? "PLC" : domain === "3DPrint" ? "3DPrint" : "Factory";
  const localPath = path.join(getKnowledgeDataRoot(), localSubDir, input.subFolder, input.fileName);
  if (input.createPlaceholder !== false && !fs.existsSync(localPath)) {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(
      localPath,
      `# ${input.title}\n\nTiSLY Knowledge asset placeholder.\n`,
      "utf8"
    );
  }

  const asset: KnowledgeAssetRecordV1 = {
    id: safeId(domain, input.title),
    domain,
    subFolder: input.subFolder,
    fileName: input.fileName,
    relativePath,
    projectNo: input.projectNo,
    projectId: input.projectId,
    title: input.title,
    category: input.category,
    tags: [...new Set((input.tags ?? []).map(String).filter(Boolean))],
    summary: input.summary,
    fileFormats: inferFileFormats(input.fileName),
    ladderDescription: input.ladderDescription,
    updatedAt: todayIsoDate(),
  };

  const assets = readRegistry().filter((a) => a.id !== asset.id);
  assets.push(asset);
  writeRegistry(assets);

  const source =
    domain === "PLC" ? "plc_asset" : domain === "3DPrint" ? "threedprint_asset" : "factory_asset";
  const cardPrefix = domain === "PLC" ? "PLC" : domain === "3DPrint" ? "3DP" : "FACT";
  const token = input.projectNo?.replace(/[^A-Z0-9]/gi, "").slice(0, 12).toUpperCase() ?? "LIB";

  const candidate = saveKnowledgeCandidateV1({
    source,
    projectId: input.projectId,
    projectNo: input.projectNo,
    title: `${input.title}（${domain}資産候補）`,
    category: input.category,
    tags: [...asset.tags, domain, input.subFolder, ...(input.projectNo ? [input.projectNo] : [])],
    summary: input.summary,
    assetPath: relativePath,
    assetKind: domain,
    draft: {
      id: `${cardPrefix}-${token}-${asset.id.slice(-6)}`,
      title: input.title,
      category: input.category,
      tags: asset.tags,
      summary: input.ladderDescription
        ? `${input.summary}\n\nラダー説明: ${input.ladderDescription}`
        : input.summary,
      files: [relativePath],
      updatedAt: todayIsoDate(),
      sourceType: domain === "PLC" ? "plc-template" : "manual",
      relatedProjectIds: input.projectId ? [input.projectId] : undefined,
      projectNo: input.projectNo,
    },
  });

  return { asset, candidate };
}

export function seedDefaultKnowledgeAssetsV1(): {
  plc: number;
  threedprint: number;
  factory: number;
} {
  let plc = 0;
  let threedprint = 0;
  let factory = 0;

  const plcSeeds = [
    { subFolder: "Templates", fileName: "self-hold-template.gxw", title: "自己保持テンプレ", ladderDescription: "押ボタン起動・停止の基本自己保持回路" },
    { subFolder: "Examples", fileName: "e-stop-example.gxw", title: "非常停止例", ladderDescription: "非常停止回路の標準例" },
    { subFolder: "IOMaps", fileName: "default-io.csv", title: "標準IOマップ", ladderDescription: "DI/DO 割当の標準表" },
  ] as const;

  for (const seed of plcSeeds) {
    registerKnowledgeAssetV1({
      domain: "PLC",
      subFolder: seed.subFolder,
      fileName: seed.fileName,
      title: seed.title,
      category: "PLC",
      tags: ["PLC", "GX Works3", seed.subFolder],
      summary: `${seed.title} — MotherShip PLC/${seed.subFolder}`,
      ladderDescription: seed.ladderDescription,
      createPlaceholder: true,
    });
    plc += 1;
  }

  const printSeeds = [
    { subFolder: "DINRail", fileName: "bracket-v1.stl", title: "DINレールブラケット" },
    { subFolder: "Camera", fileName: "mount-v2.step", title: "カメラマウント" },
    { subFolder: "RP2350", fileName: "enclosure-v1.stl", title: "RP2350筐体" },
  ] as const;

  for (const seed of printSeeds) {
    registerKnowledgeAssetV1({
      domain: "3DPrint",
      subFolder: seed.subFolder,
      fileName: seed.fileName,
      title: seed.title,
      category: "TiSLY",
      tags: ["3DPrint", seed.subFolder],
      summary: `${seed.title} — 3DPrint/${seed.subFolder}`,
      createPlaceholder: true,
    });
    threedprint += 1;
  }

  const factorySeeds = [
    { subFolder: "Conveyor", fileName: "line-demo.json", title: "コンベアデモ構成" },
    { subFolder: "Modbus", fileName: "register-map.csv", title: "Modbusレジスタマップ" },
    { subFolder: "Demo", fileName: "factory-overview.md", title: "Factoryデモ概要" },
  ] as const;

  for (const seed of factorySeeds) {
    registerKnowledgeAssetV1({
      domain: "Factory",
      subFolder: seed.subFolder,
      fileName: seed.fileName,
      title: seed.title,
      category: "PLC",
      tags: ["Factory", seed.subFolder, "TiSLY Factory"],
      summary: `${seed.title} — Factory/${seed.subFolder}`,
      createPlaceholder: true,
    });
    factory += 1;
  }

  return { plc, threedprint, factory };
}

export {
  PLC_ASSET_SUBFOLDERS_V1,
  THREEDPRINT_ASSET_SUBFOLDERS_V1,
  FACTORY_ASSET_SUBFOLDERS_V1,
};

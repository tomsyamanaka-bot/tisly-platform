/** TiSLY MotherShip Explorer v1 — エクスプローラー API（Sync Stabilization） */

import fs from "fs";
import path from "path";
import { listBusinessProjects } from "../business/business-store.js";
import {
  MOTHERSHIP_TOP_FOLDERS,
  MOTHERSHIP_KNOWLEDGE_FOLDERS,
  MOTHERSHIP_UNC,
  buildMothershipKnowledgeRelativePath,
} from "../storage/mothership-paths-v1.js";
import type { MothershipExplorerNodeV1 } from "./knowledge-automation-types.js";
import {
  FACTORY_ASSET_SUBFOLDERS_V1,
  PLC_ASSET_SUBFOLDERS_V1,
  THREEDPRINT_ASSET_SUBFOLDERS_V1,
} from "./knowledge-automation-types.js";
import { listKnowledgeAssetsV1 } from "./knowledge-assets-v1.js";
import { getKnowledgeCandidatesStatsV1, listKnowledgeCandidatesV1 } from "./knowledge-candidates-store-v1.js";
import { getKnowledgeStructureV1, listKnowledgeCardsV1 } from "./knowledge-store-v1.js";
import { getKnowledgeDataRoot } from "./knowledge-paths-v1.js";
import { getKnowledgeQnapSyncStatusV1 } from "./knowledge-qnap-sync-store-v1.js";
import { getKnowledgeQnapConnectionInfoV1 } from "./knowledge-qnap-sync-service-v1.js";

/** Knowledge 対象フォルダ */
const KNOWLEDGE_TARGET_FOLDERS = new Set([
  "AI",
  "KnowledgeCards",
  "SearchIndex",
  "Candidates",
  "Assets",
  "PLC",
  "3DPrint",
  "Factory",
  "Ladder",
  "Materials",
]);

function folderNode(
  name: string,
  relPath: string,
  opts?: {
    children?: MothershipExplorerNodeV1[];
    count?: number;
    meta?: Record<string, string | number | boolean>;
  }
): MothershipExplorerNodeV1 {
  return {
    name,
    path: relPath,
    kind: "folder",
    count: opts?.count ?? opts?.children?.length,
    children: opts?.children,
    meta: opts?.meta,
  };
}

function countLocalFiles(subPath: string): number {
  try {
    const full = path.join(getKnowledgeDataRoot(), subPath);
    if (!fs.existsSync(full)) return 0;
    return fs.readdirSync(full).filter((f) => !f.startsWith(".")).length;
  } catch {
    return 0;
  }
}

function getLocalDirMtime(subPath: string): string | null {
  try {
    const full = path.join(getKnowledgeDataRoot(), subPath);
    if (!fs.existsSync(full)) return null;
    return fs.statSync(full).mtime.toISOString();
  } catch {
    return null;
  }
}

function isKnowledgeTarget(pathStr: string): boolean {
  const top = pathStr.split(/[/\\]/)[0];
  return KNOWLEDGE_TARGET_FOLDERS.has(top) || pathStr.startsWith("AI/");
}

function buildKnowledgeExplorerTree(): MothershipExplorerNodeV1 {
  const structure = getKnowledgeStructureV1();
  const stats = getKnowledgeCandidatesStatsV1();
  const children: MothershipExplorerNodeV1[] = MOTHERSHIP_KNOWLEDGE_FOLDERS.map((folder) =>
    folderNode(folder, buildMothershipKnowledgeRelativePath(folder), {
      count: folder === "KnowledgeCards" ? structure.cardCount : countLocalFiles(folder),
      meta: {
        knowledgeTarget: true,
        lastUpdated: getLocalDirMtime(folder) ?? "",
      },
      children: [
        {
          name: "local",
          path: `local/${folder}`,
          kind: "folder",
          count: folder === "KnowledgeCards" ? structure.cardCount : countLocalFiles(folder),
          meta: { knowledgeTarget: true },
        },
      ],
    })
  );

  children.push(
    folderNode("Candidates", "AI/Candidates", {
      count: stats.pending + stats.approved,
      meta: { knowledgeTarget: true, pending: stats.pending },
      children: [
        { name: "pending", path: "AI/Candidates/pending", kind: "folder", count: stats.pending, meta: { knowledgeTarget: true } },
        { name: "approved", path: "AI/Candidates/approved", kind: "folder", count: stats.approved, meta: { knowledgeTarget: true } },
      ],
    })
  );

  children.push(
    folderNode("Assets", "AI/Assets", {
      count: countLocalFiles("Assets"),
      meta: { knowledgeTarget: true },
    })
  );

  return folderNode("AI", "AI", { children, meta: { knowledgeTarget: true } });
}

function buildTopFolderNode(name: string): MothershipExplorerNodeV1 {
  const knowledgeTarget = isKnowledgeTarget(name);
  let count: number | undefined;
  if (name === "Projects") count = listBusinessProjects().length;
  else if (name === "PLC") count = listKnowledgeAssetsV1({ domain: "PLC" }).length;
  else if (name === "3DPrint") count = listKnowledgeAssetsV1({ domain: "3DPrint" }).length;
  else if (name === "AI") return buildKnowledgeExplorerTree();

  return folderNode(name, name, {
    count,
    meta: { knowledgeTarget },
  });
}

function buildPlcExplorerTree(): MothershipExplorerNodeV1 {
  const assets = listKnowledgeAssetsV1({ domain: "PLC" });
  const children = PLC_ASSET_SUBFOLDERS_V1.map((sub) => {
    const subAssets = assets.filter((a) => a.subFolder === sub);
    return folderNode(sub, `PLC/${sub}`, {
      count: subAssets.length,
      meta: { knowledgeTarget: true },
      children: subAssets.slice(0, 10).map((a) => ({
        name: a.fileName,
        path: a.relativePath,
        kind: "file" as const,
        meta: { projectNo: a.projectNo ?? "", title: a.title, knowledgeTarget: true },
      })),
    });
  });
  return folderNode("PLC", "PLC", { children, count: assets.length, meta: { knowledgeTarget: true } });
}

function build3DPrintExplorerTree(): MothershipExplorerNodeV1 {
  const assets = listKnowledgeAssetsV1({ domain: "3DPrint" });
  const children = THREEDPRINT_ASSET_SUBFOLDERS_V1.map((sub) => {
    const subAssets = assets.filter((a) => a.subFolder === sub);
    return folderNode(sub, `3DPrint/${sub}`, {
      count: subAssets.length,
      meta: { knowledgeTarget: true },
      children: subAssets.slice(0, 10).map((a) => ({
        name: a.fileName,
        path: a.relativePath,
        kind: "file" as const,
        meta: { formats: (a.fileFormats ?? []).join(","), knowledgeTarget: true },
      })),
    });
  });
  return folderNode("3DPrint", "3DPrint", { children, count: assets.length, meta: { knowledgeTarget: true } });
}

function buildFactoryExplorerTree(): MothershipExplorerNodeV1 {
  const assets = listKnowledgeAssetsV1({ domain: "Factory" });
  const children = FACTORY_ASSET_SUBFOLDERS_V1.map((sub) => {
    const subAssets = assets.filter((a) => a.subFolder === sub);
    return folderNode(sub, `Factory/${sub}`, {
      count: subAssets.length,
      meta: { knowledgeTarget: true },
      children: subAssets.map((a) => ({
        name: a.fileName,
        path: a.relativePath,
        kind: "file" as const,
        meta: { knowledgeTarget: true },
      })),
    });
  });
  return folderNode("Factory", "Factory", { children, count: assets.length, meta: { knowledgeTarget: true } });
}

function buildProjectsExplorerTree(limit = 30): MothershipExplorerNodeV1 {
  const projects = listBusinessProjects().slice(0, limit);
  const children = projects.map((p) => {
    const segment = `${p.projectNo}_${p.title}`.slice(0, 48);
    return folderNode(segment, `Projects/${segment}`, {
      meta: { projectNo: p.projectNo, knowledgeTarget: false },
      children: [
        { name: "Documents", path: `Documents/${segment}`, kind: "folder", meta: { knowledgeTarget: false } },
        { name: "Photos/survey", path: `Photos/${segment}/survey`, kind: "folder", meta: { knowledgeTarget: true } },
        { name: "Photos/completion", path: `Photos/${segment}/completion`, kind: "folder", meta: { knowledgeTarget: true } },
        { name: "Reports", path: `Reports/${segment}`, kind: "folder", meta: { knowledgeTarget: false } },
      ],
    });
  });
  return folderNode("Projects", "Projects", { children, count: listBusinessProjects().length, meta: { knowledgeTarget: false } });
}

function buildRecentUpdates(limit = 8): Array<{ label: string; path: string; updatedAt: string; kind: string }> {
  const items: Array<{ label: string; path: string; updatedAt: string; kind: string }> = [];

  for (const card of listKnowledgeCardsV1().slice(0, limit)) {
    items.push({
      label: card.title,
      path: `AI/KnowledgeCards/${card.id}.json`,
      updatedAt: card.updatedAt,
      kind: "KnowledgeCard",
    });
  }
  for (const c of listKnowledgeCandidatesV1().slice(0, limit)) {
    items.push({
      label: c.title,
      path: `AI/Candidates/${c.id}.json`,
      updatedAt: c.updatedAt,
      kind: "Candidate",
    });
  }
  for (const a of listKnowledgeAssetsV1().slice(0, limit)) {
    items.push({
      label: a.title,
      path: a.relativePath,
      updatedAt: a.updatedAt,
      kind: "Asset",
    });
  }

  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

function buildQnapRootNode(): MothershipExplorerNodeV1 {
  return folderNode("QNAP TiSLY", MOTHERSHIP_UNC, {
    children: [
      { name: "UNC", path: MOTHERSHIP_UNC, kind: "link" },
      ...MOTHERSHIP_TOP_FOLDERS.map((f) => buildTopFolderNode(f)),
    ],
  });
}

export function getMothershipExplorerTreeV1(): {
  unc: string;
  updatedAt: string;
  roots: MothershipExplorerNodeV1[];
  summary: {
    knowledgeCards: number;
    pendingCandidates: number;
    plcAssets: number;
    threedPrintAssets: number;
    factoryAssets: number;
    projects: number;
  };
  syncStatus: ReturnType<typeof getKnowledgeQnapSyncStatusV1>;
  connection: ReturnType<typeof getKnowledgeQnapConnectionInfoV1>;
  recentUpdates: ReturnType<typeof buildRecentUpdates>;
  topFolders: Array<{ name: string; count?: number; knowledgeTarget: boolean }>;
} {
  const stats = getKnowledgeCandidatesStatsV1();
  const assets = listKnowledgeAssetsV1();
  const syncStatus = getKnowledgeQnapSyncStatusV1();
  const connection = getKnowledgeQnapConnectionInfoV1();

  const explorerFolders = [
    "Projects",
    "AI",
    "Photos",
    "Reports",
    "Documents",
    "PLC",
    "ESP",
    "3DPrint",
    "Factory",
    "Scan",
    "SiteMaps",
  ] as const;

  const topFolders = explorerFolders.map((name) => {
    let count: number | undefined;
    if (name === "Projects") count = listBusinessProjects().length;
    else if (name === "AI") count = listKnowledgeCardsV1().length + stats.pending;
    else if (name === "PLC") count = assets.filter((a) => a.domain === "PLC").length;
    else if (name === "3DPrint") count = assets.filter((a) => a.domain === "3DPrint").length;
    else if (name === "Factory") count = assets.filter((a) => a.domain === "Factory").length;
    return { name, count, knowledgeTarget: isKnowledgeTarget(name) };
  });

  return {
    unc: MOTHERSHIP_UNC,
    updatedAt: new Date().toISOString(),
    roots: [
      buildQnapRootNode(),
      buildKnowledgeExplorerTree(),
      buildProjectsExplorerTree(),
      buildPlcExplorerTree(),
      build3DPrintExplorerTree(),
      buildFactoryExplorerTree(),
    ],
    summary: {
      knowledgeCards: listKnowledgeCardsV1().length,
      pendingCandidates: stats.pending,
      plcAssets: assets.filter((a) => a.domain === "PLC").length,
      threedPrintAssets: assets.filter((a) => a.domain === "3DPrint").length,
      factoryAssets: assets.filter((a) => a.domain === "Factory").length,
      projects: listBusinessProjects().length,
    },
    syncStatus,
    connection,
    recentUpdates: buildRecentUpdates(),
    topFolders,
  };
}

export function searchMothershipExplorerV1(query: string, projectNo?: string): MothershipExplorerNodeV1[] {
  const q = query.trim().toLowerCase();
  const hits: MothershipExplorerNodeV1[] = [];
  if (!q && !projectNo) return hits;

  for (const card of listKnowledgeCardsV1()) {
    if (projectNo && card.projectNo !== projectNo) continue;
    const hay = [card.title, card.category, ...(card.tags ?? []), card.summary, card.projectNo ?? ""]
      .join(" ")
      .toLowerCase();
    if (q && !hay.includes(q)) continue;
    hits.push({
      name: card.title,
      path: `AI/KnowledgeCards/${card.id}.json`,
      kind: "file",
      meta: { id: card.id, projectNo: card.projectNo ?? "", knowledgeTarget: true },
    });
  }

  for (const c of listKnowledgeCandidatesV1()) {
    if (projectNo && c.projectNo !== projectNo) continue;
    const hay = [c.title, c.summary, ...(c.tags ?? []), c.projectNo ?? ""].join(" ").toLowerCase();
    if (q && !hay.includes(q)) continue;
    hits.push({
      name: c.title,
      path: `AI/Candidates/${c.id}.json`,
      kind: "file",
      meta: { id: c.id, status: c.status, projectNo: c.projectNo ?? "", knowledgeTarget: true },
    });
  }

  for (const asset of listKnowledgeAssetsV1({ projectNo: projectNo || undefined })) {
    const hay = [asset.title, asset.summary, ...(asset.tags ?? []), asset.projectNo ?? ""]
      .join(" ")
      .toLowerCase();
    if (q && !hay.includes(q)) continue;
    hits.push({
      name: asset.title,
      path: asset.relativePath,
      kind: "file",
      meta: { domain: asset.domain, projectNo: asset.projectNo ?? "", knowledgeTarget: true },
    });
  }

  return hits.slice(0, 50);
}

export function getMothershipExplorerProjectLinksV1(projectNo: string): {
  projectNo: string;
  projectId: string | null;
  links: Array<{ label: string; path: string }>;
} {
  const project = listBusinessProjects().find((p) => p.projectNo === projectNo);
  const segment = project ? `${project.projectNo}_${project.title}` : projectNo;
  return {
    projectNo,
    projectId: project?.id ?? null,
    links: [
      { label: "Projects", path: `Projects/${segment}/source` },
      { label: "Photos (survey)", path: `Photos/${segment}/survey` },
      { label: "Photos (completion)", path: `Photos/${segment}/completion` },
      { label: "Documents", path: `Documents/${segment}` },
      { label: "Reports", path: `Reports/${segment}/completion-report` },
      { label: "Knowledge Cards", path: `AI/KnowledgeCards?projectNo=${projectNo}` },
      { label: "Candidates", path: `AI/Candidates?projectNo=${projectNo}` },
      { label: "PLC", path: `PLC/Projects?projectNo=${projectNo}` },
      { label: "3DPrint", path: `3DPrint/Parts?projectNo=${projectNo}` },
      { label: "Factory", path: `Factory/Demo?projectNo=${projectNo}` },
    ],
  };
}

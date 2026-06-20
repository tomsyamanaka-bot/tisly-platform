/** TiSLY MotherShip Explorer v1 — エクスプローラー API */

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

function folderNode(
  name: string,
  relPath: string,
  children?: MothershipExplorerNodeV1[]
): MothershipExplorerNodeV1 {
  return { name, path: relPath, kind: "folder", count: children?.length, children };
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

function buildKnowledgeExplorerTree(): MothershipExplorerNodeV1 {
  const structure = getKnowledgeStructureV1();
  const stats = getKnowledgeCandidatesStatsV1();
  const children: MothershipExplorerNodeV1[] = MOTHERSHIP_KNOWLEDGE_FOLDERS.map((folder) =>
    folderNode(folder, buildMothershipKnowledgeRelativePath(folder), [
      {
        name: "local",
        path: `local/${folder}`,
        kind: "folder",
        count: folder === "KnowledgeCards" ? structure.cardCount : countLocalFiles(folder),
      },
    ])
  );

  children.push(
    folderNode("Candidates", "AI/Candidates", [
      { name: "pending", path: "AI/Candidates/pending", kind: "folder", count: stats.pending },
      { name: "approved", path: "AI/Candidates/approved", kind: "folder", count: stats.approved },
    ])
  );

  return folderNode("Knowledge", "AI", children);
}

function buildPlcExplorerTree(): MothershipExplorerNodeV1 {
  const assets = listKnowledgeAssetsV1({ domain: "PLC" });
  const children = PLC_ASSET_SUBFOLDERS_V1.map((sub) => {
    const subAssets = assets.filter((a) => a.subFolder === sub);
    return folderNode(
      sub,
      `PLC/${sub}`,
      subAssets.map((a) => ({
        name: a.fileName,
        path: a.relativePath,
        kind: "file" as const,
        meta: { projectNo: a.projectNo ?? "", title: a.title },
      }))
    );
  });
  return folderNode("PLC", "PLC", children);
}

function build3DPrintExplorerTree(): MothershipExplorerNodeV1 {
  const assets = listKnowledgeAssetsV1({ domain: "3DPrint" });
  const children = THREEDPRINT_ASSET_SUBFOLDERS_V1.map((sub) => {
    const subAssets = assets.filter((a) => a.subFolder === sub);
    return folderNode(
      sub,
      `3DPrint/${sub}`,
      subAssets.slice(0, 20).map((a) => ({
        name: a.fileName,
        path: a.relativePath,
        kind: "file" as const,
        meta: { formats: (a.fileFormats ?? []).join(",") },
      }))
    );
  });
  return folderNode("3DPrint", "3DPrint", children);
}

function buildFactoryExplorerTree(): MothershipExplorerNodeV1 {
  const assets = listKnowledgeAssetsV1({ domain: "Factory" });
  const children = FACTORY_ASSET_SUBFOLDERS_V1.map((sub) => {
    const subAssets = assets.filter((a) => a.subFolder === sub);
    return folderNode(
      sub,
      `Factory/${sub}`,
      subAssets.map((a) => ({
        name: a.fileName,
        path: a.relativePath,
        kind: "file" as const,
      }))
    );
  });
  return folderNode("Factory", "Factory", children);
}

function buildProjectsExplorerTree(limit = 30): MothershipExplorerNodeV1 {
  const projects = listBusinessProjects().slice(0, limit);
  const children = projects.map((p) => {
    const segment = `${p.projectNo}_${p.title}`.slice(0, 48);
    return folderNode(segment, `Projects/${segment}`, [
      { name: "Documents", path: `Documents/${segment}`, kind: "folder" },
      { name: "Photos/survey", path: `Photos/${segment}/survey`, kind: "folder" },
      { name: "Photos/completion", path: `Photos/${segment}/completion`, kind: "folder" },
      { name: "Reports", path: `Reports/${segment}`, kind: "folder" },
    ]);
  });
  return folderNode("Projects", "Projects", children);
}

function buildQnapRootNode(): MothershipExplorerNodeV1 {
  return folderNode("QNAP TiSLY", MOTHERSHIP_UNC, [
    { name: "UNC", path: MOTHERSHIP_UNC, kind: "link" },
    ...MOTHERSHIP_TOP_FOLDERS.map((f) => folderNode(f, f)),
  ]);
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
} {
  const stats = getKnowledgeCandidatesStatsV1();
  const assets = listKnowledgeAssetsV1();
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
      meta: { id: card.id, projectNo: card.projectNo ?? "" },
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
      meta: { id: c.id, status: c.status, projectNo: c.projectNo ?? "" },
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
      meta: { domain: asset.domain, projectNo: asset.projectNo ?? "" },
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
      { label: "PLC", path: `PLC/Projects?projectNo=${projectNo}` },
      { label: "3DPrint", path: `3DPrint/Parts?projectNo=${projectNo}` },
      { label: "Factory", path: `Factory/Demo?projectNo=${projectNo}` },
    ],
  };
}

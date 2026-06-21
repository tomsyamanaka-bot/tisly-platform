/** TiSLY Knowledge QNAP 同期エンキュー v1 — 各リソースからキューへ */

import fs from "fs";
import path from "path";
import {
  enqueueKnowledgeQnapSyncV1,
  type KnowledgeQnapSyncKindV1,
} from "./knowledge-qnap-sync-store-v1.js";
import {
  getKnowledgeDataRoot,
  getKnowledgeSearchIndexPath,
  buildKnowledgeCardFileName,
} from "./knowledge-paths-v1.js";

export function enqueueKnowledgeCardSyncV1(cardId: string, localPath?: string): void {
  const filePath = localPath ?? path.join(getKnowledgeDataRoot(), "KnowledgeCards", buildKnowledgeCardFileName(cardId));
  if (!fs.existsSync(filePath)) return;
  enqueueKnowledgeQnapSyncV1({
    syncKind: "KnowledgeCards",
    resourceId: cardId,
    cardId,
    localPath: filePath,
    relativePath: `AI/KnowledgeCards/${buildKnowledgeCardFileName(cardId)}`,
  });
}

export function enqueueKnowledgeCandidateSyncV1(candidateId: string): void {
  const filePath = path.join(getKnowledgeDataRoot(), "Candidates", `${candidateId}.json`);
  if (!fs.existsSync(filePath)) return;
  enqueueKnowledgeQnapSyncV1({
    syncKind: "Candidates",
    resourceId: candidateId,
    localPath: filePath,
    relativePath: `AI/Candidates/${candidateId}.json`,
  });
}

export function enqueueKnowledgeAssetSyncV1(assetId: string, localPath: string, relativePath: string): void {
  if (!fs.existsSync(localPath)) return;
  enqueueKnowledgeQnapSyncV1({
    syncKind: "Assets",
    resourceId: assetId,
    localPath,
    relativePath,
  });
}

export function enqueueKnowledgeSearchIndexSyncV1(): void {
  const indexPath = getKnowledgeSearchIndexPath();
  if (!fs.existsSync(indexPath)) return;
  enqueueKnowledgeQnapSyncV1({
    syncKind: "SearchIndex",
    resourceId: "index.json",
    localPath: indexPath,
    relativePath: "AI/SearchIndex/index.json",
  });
}

export function enqueueKnowledgeFileSyncV1(input: {
  syncKind: KnowledgeQnapSyncKindV1;
  resourceId: string;
  localPath: string;
  relativePath: string;
}): void {
  enqueueKnowledgeQnapSyncV1(input);
}

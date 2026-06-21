/** TiSLY Knowledge Automation Engine v1 — 候補ストア */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { KnowledgeCandidateStatusV1, KnowledgeCandidateV1 } from "./knowledge-automation-types.js";
import { getKnowledgeDataRoot, ensureKnowledgeFolderStructure } from "./knowledge-paths-v1.js";
import { enqueueKnowledgeCandidateSyncV1 } from "./knowledge-qnap-enqueue-v1.js";
import { saveKnowledgeCardV1, getKnowledgeCardV1 } from "./knowledge-store-v1.js";
import type { KnowledgeCardV1 } from "./knowledge-types.js";

const ID_RE = /^KC-[A-Z0-9]{8,16}$/;

function candidatesDir(): string {
  ensureKnowledgeFolderStructure();
  const dir = path.join(getKnowledgeDataRoot(), "Candidates");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readCandidate(filePath: string): KnowledgeCandidateV1 | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as KnowledgeCandidateV1;
  } catch {
    return null;
  }
}

function writeCandidate(candidate: KnowledgeCandidateV1, opts?: { skipQnapQueue?: boolean }): void {
  const filePath = path.join(candidatesDir(), `${candidate.id}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  if (!opts?.skipQnapQueue) {
    enqueueKnowledgeCandidateSyncV1(candidate.id);
  }
}

export function generateKnowledgeCandidateIdV1(): string {
  return `KC-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export function listKnowledgeCandidatesV1(filter?: {
  status?: KnowledgeCandidateStatusV1;
  projectId?: string;
  projectNo?: string;
  category?: string;
  source?: KnowledgeCandidateV1["source"];
}): KnowledgeCandidateV1[] {
  const dir = candidatesDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let items: KnowledgeCandidateV1[] = [];
  for (const file of files) {
    const c = readCandidate(path.join(dir, file));
    if (c?.id) items.push(c);
  }
  if (filter?.status) items = items.filter((c) => c.status === filter.status);
  if (filter?.projectId) items = items.filter((c) => c.projectId === filter.projectId);
  if (filter?.projectNo) items = items.filter((c) => c.projectNo === filter.projectNo);
  if (filter?.category) items = items.filter((c) => c.category === filter.category);
  if (filter?.source) items = items.filter((c) => c.source === filter.source);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getKnowledgeCandidateV1(id: string): KnowledgeCandidateV1 | null {
  const safe = String(id ?? "").trim();
  if (!safe || !ID_RE.test(safe)) return null;
  return readCandidate(path.join(candidatesDir(), `${safe}.json`));
}

function findDuplicateCandidate(input: {
  projectId?: string;
  stage?: KnowledgeCandidateV1["stage"];
  source: KnowledgeCandidateV1["source"];
  draftId?: string;
  title: string;
}): KnowledgeCandidateV1 | null {
  return (
    listKnowledgeCandidatesV1({ projectId: input.projectId }).find((c) => {
      if (c.status === "rejected") return false;
      if (c.source !== input.source) return false;
      if (input.stage && c.stage !== input.stage) return false;
      if (input.draftId && c.draft.id === input.draftId) return true;
      return c.title === input.title;
    }) ?? null
  );
}

export function saveKnowledgeCandidateV1(
  input: Omit<KnowledgeCandidateV1, "id" | "status" | "createdAt" | "updatedAt"> & {
    id?: string;
    status?: KnowledgeCandidateStatusV1;
  }
): KnowledgeCandidateV1 {
  const duplicate = findDuplicateCandidate({
    projectId: input.projectId,
    stage: input.stage,
    source: input.source,
    draftId: input.draft.id,
    title: input.title,
  });
  if (duplicate && duplicate.status === "pending") return duplicate;
  if (duplicate && duplicate.status === "approved") return duplicate;

  const id = input.id && ID_RE.test(input.id) ? input.id : generateKnowledgeCandidateIdV1();
  const ts = nowIso();
  const candidate: KnowledgeCandidateV1 = {
    id,
    status: input.status ?? "pending",
    source: input.source,
    stage: input.stage,
    projectId: input.projectId,
    projectNo: input.projectNo,
    customerName: input.customerName,
    title: input.title,
    category: input.category,
    tags: [...new Set((input.tags ?? []).map(String).filter(Boolean))],
    summary: input.summary,
    draft: input.draft,
    pdfExtract: input.pdfExtract,
    ocrExtract: input.ocrExtract,
    assetPath: input.assetPath,
    assetKind: input.assetKind,
    createdAt: ts,
    updatedAt: ts,
  };
  writeCandidate(candidate);
  return candidate;
}

export function approveKnowledgeCandidateV1(id: string): {
  candidate: KnowledgeCandidateV1;
  card: KnowledgeCardV1;
} {
  const candidate = getKnowledgeCandidateV1(id);
  if (!candidate) throw new Error("candidate not found");
  if (candidate.status === "approved" && candidate.approvedCardId) {
    const existing = getKnowledgeCardV1(candidate.approvedCardId);
    if (existing) return { candidate, card: existing };
  }
  if (candidate.status === "rejected") throw new Error("candidate already rejected");

  const card = saveKnowledgeCardV1({
    ...candidate.draft,
    sourceType: candidate.draft.sourceType ?? "project",
    relatedProjectIds: candidate.projectId ? [candidate.projectId] : candidate.draft.relatedProjectIds,
    projectNo: candidate.projectNo ?? candidate.draft.projectNo,
    customerName: candidate.customerName ?? candidate.draft.customerName,
  });

  const updated: KnowledgeCandidateV1 = {
    ...candidate,
    status: "approved",
    approvedCardId: card.id,
    updatedAt: nowIso(),
  };
  writeCandidate(updated);
  return { candidate: updated, card };
}

export function bulkApproveKnowledgeCandidatesV1(ids: string[]): {
  approved: Array<{ id: string; cardId: string }>;
  errors: Array<{ id: string; error: string }>;
} {
  const approved: Array<{ id: string; cardId: string }> = [];
  const errors: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    try {
      const result = approveKnowledgeCandidateV1(id);
      approved.push({ id, cardId: result.card.id });
    } catch (e) {
      errors.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { approved, errors };
}

export function bulkRejectKnowledgeCandidatesV1(
  ids: string[],
  reason = "一括却下"
): { rejected: string[]; errors: Array<{ id: string; error: string }> } {
  const rejected: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    try {
      rejectKnowledgeCandidateV1(id, reason);
      rejected.push(id);
    } catch (e) {
      errors.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { rejected, errors };
}

export function listKnowledgeCandidateCategoriesV1(): string[] {
  const cats = new Set(listKnowledgeCandidatesV1().map((c) => c.category).filter(Boolean));
  return [...cats].sort();
}

export function rejectKnowledgeCandidateV1(id: string, reason = ""): KnowledgeCandidateV1 {
  const candidate = getKnowledgeCandidateV1(id);
  if (!candidate) throw new Error("candidate not found");
  const updated: KnowledgeCandidateV1 = {
    ...candidate,
    status: "rejected",
    rejectedReason: reason.trim() || "却下",
    updatedAt: nowIso(),
  };
  writeCandidate(updated);
  return updated;
}

export function getKnowledgeCandidatesStatsV1(): {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
} {
  const all = listKnowledgeCandidatesV1();
  return {
    pending: all.filter((c) => c.status === "pending").length,
    approved: all.filter((c) => c.status === "approved").length,
    rejected: all.filter((c) => c.status === "rejected").length,
    total: all.length,
  };
}

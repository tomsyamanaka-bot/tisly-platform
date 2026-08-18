/** Knowledge Module API — 認証付き fetch */

import { getCustomerToken } from "../../../customer-auth.js";

export interface KnowledgeModuleMediaDto {
  url: string;
  fileName?: string;
  kind?: "pdf" | "image" | "video" | "unknown";
}

export interface KnowledgeModuleItemDto {
  id: string;
  title: string;
  summary: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  medias?: Array<KnowledgeModuleMediaDto | string>;
  files?: Array<KnowledgeModuleMediaDto | string>;
  media?: KnowledgeModuleMediaDto | string | null;
  file?: KnowledgeModuleMediaDto | string | null;
  createdAt: string;
  /** 本文詳細（任意） */
  body?: string;
}

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getCustomerToken();
  if (!token) {
    throw new Error("ログインが必要です");
  }
  const res = await fetch(`/api/knowledge${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function fetchKnowledgeModuleItems(): Promise<{
  items: KnowledgeModuleItemDto[];
  tags: string[];
}> {
  return api("/module-v1/items");
}

export async function createKnowledgeModuleItem(body: {
  title: string;
  summary: string;
  genre: string;
  tags: string[];
  pdf_url: string | null;
  medias: KnowledgeModuleMediaDto[];
}): Promise<KnowledgeModuleItemDto> {
  const { item } = await api<{ item: KnowledgeModuleItemDto }>("/module-v1/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return item;
}

export async function updateKnowledgeModuleItem(
  id: string,
  body: {
    title: string;
    summary: string;
    genre: string;
    tags: string[];
    pdf_url: string | null;
    medias: KnowledgeModuleMediaDto[];
  }
): Promise<KnowledgeModuleItemDto> {
  const { item } = await api<{ item: KnowledgeModuleItemDto }>(
    `/module-v1/items/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
  return item;
}

export async function uploadKnowledgeModulePdf(
  file: File
): Promise<{ pdf_url: string; fileName: string }> {
  const base64 = await readFileAsBase64(file);
  // 互換エンドポイント名（PDF以外の
  // メディアも同一 API で保存）
  return api("/module-v1/upload-pdf", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, fileBase64: base64 }),
  });
}

export async function uploadKnowledgeModuleFiles(
  files: File[]
): Promise<KnowledgeModuleMediaDto[]> {
  return Promise.all(
    files.map(async (file) => {
      const uploaded = await uploadKnowledgeModulePdf(file);
      return {
        url: uploaded.pdf_url,
        fileName: file.name,
      };
    })
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

export function parseTagsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,、\s#]+/)) {
    const tag = part.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

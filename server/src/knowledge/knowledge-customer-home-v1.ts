/** Knowledge Customer UI V1 — お客様向けホーム（カテゴリ・件数・最近使った資料） */

import { listKnowledgeUsageLogsV1 } from "./knowledge-usage-log-v1.js";
import { buildUnifiedKnowledgeSearchCorpusV1 } from "./unified-knowledge-search-v1.js";

export interface KnowledgeCustomerCategoryV1 {
  id: string;
  icon: string;
  label: string;
  description: string;
  count: number;
  searchQuery: string;
}

export interface KnowledgeCustomerRecentItemV1 {
  id: string;
  kind: string;
  title: string;
  category: string;
  usedAt?: string;
  detailUrl: string;
}

export interface KnowledgeCustomerHomeV1 {
  categories: KnowledgeCustomerCategoryV1[];
  recentItems: KnowledgeCustomerRecentItemV1[];
}

const CUSTOMER_CATEGORY_DEFS: Omit<KnowledgeCustomerCategoryV1, "count">[] = [
  {
    id: "camera",
    icon: "📷",
    label: "防犯カメラ",
    description: "設置位置・映像の見え方を確認",
    searchQuery: "防犯カメラ",
  },
  {
    id: "sensor",
    icon: "📡",
    label: "センサー",
    description: "人感・開閉・環境センサー",
    searchQuery: "センサー",
  },
  {
    id: "light",
    icon: "💡",
    label: "ライト",
    description: "照明・防犯灯・足元灯",
    searchQuery: "照明",
  },
  {
    id: "electrical",
    icon: "🔌",
    label: "電気設備",
    description: "分電盤・コンセント・配線",
    searchQuery: "コンセント",
  },
  {
    id: "factory",
    icon: "🏭",
    label: "工場設備",
    description: "ライン・制御盤・設備連動",
    searchQuery: "工場",
  },
  {
    id: "network",
    icon: "📶",
    label: "ネットワーク",
    description: "LAN・Wi-Fi・通信機器",
    searchQuery: "LAN",
  },
  {
    id: "3dprint",
    icon: "🖨",
    label: "3Dプリント部品",
    description: "取付金具・カスタム部品",
    searchQuery: "3DPrint",
  },
  {
    id: "manual",
    icon: "📘",
    label: "マニュアル",
    description: "取扱説明・完了後の確認",
    searchQuery: "マニュアル",
  },
];

function countForCategory(query: string, corpus: ReturnType<typeof buildUnifiedKnowledgeSearchCorpusV1>): number {
  const q = query.toLowerCase();
  return corpus.filter((doc) => {
    const hay = `${doc.title} ${doc.category} ${(doc.tags || []).join(" ")} ${doc.body}`.toLowerCase();
    return hay.includes(q) || doc.category.toLowerCase().includes(q);
  }).length;
}

function buildRecentItems(limit = 6): KnowledgeCustomerRecentItemV1[] {
  const logs = listKnowledgeUsageLogsV1(40);
  const seen = new Set<string>();
  const items: KnowledgeCustomerRecentItemV1[] = [];

  for (const log of logs) {
    const key = `${log.kind || "card"}:${log.knowledgeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: log.knowledgeId,
      kind: log.kind || "knowledge_card",
      title: log.title || log.knowledgeId,
      category: log.category || "—",
      usedAt: log.usedAt,
      detailUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(log.knowledgeId)}${log.kind ? `&kind=${encodeURIComponent(log.kind)}` : ""}`,
    });
    if (items.length >= limit) break;
  }
  return items;
}

export function buildCustomerHomeV1(): KnowledgeCustomerHomeV1 {
  const corpus = buildUnifiedKnowledgeSearchCorpusV1();
  const categories = CUSTOMER_CATEGORY_DEFS.map((def) => ({
    ...def,
    count: countForCategory(def.searchQuery, corpus),
  }));
  return {
    categories,
    recentItems: buildRecentItems(),
  };
}

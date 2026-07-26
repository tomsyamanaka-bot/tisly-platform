/**
 * TOMS 社内専用の標準単価マスター v1。
 * OCR・音声・手入力の品名に対し、
 * 類似品の単価を自動補完・提案する。
 * 既存マスター／テンプレは上書きしない。
 */

export const TOMS_MASTER_DATA_V1_SCHEMA = 1 as const;

export type TomsMasterCategoryV1 =
  | "electric"
  | "lan"
  | "camera"
  | "lighting"
  | "outlet"
  | "labor"
  | "other";

export interface TomsMasterItemV1 {
  id: string;
  /** 正式品名（見積に載せる標準名） */
  name: string;
  /** 検索用エイリアス */
  aliases: string[];
  unit: string;
  /** TOMS 標準売価（税抜） */
  unitPrice: number;
  category: TomsMasterCategoryV1;
  /** 原価目安（任意） */
  costPrice?: number;
  memo?: string;
}

/** TOMS よく使う電気・通信・人工のデフォルト単価 */
export const TOMS_MASTER_ITEMS_V1: readonly TomsMasterItemV1[] = [
  {
    id: "toms-vvf-20-2c",
    name: "VVFケーブル 2.0mm-2C",
    aliases: ["VVF", "VVF2.0", "VVF2.0mm", "VVF2.0-2C", "VVFケーブル", "ケーブル VVF"],
    unit: "m",
    unitPrice: 280,
    costPrice: 120,
    category: "electric",
  },
  {
    id: "toms-vvf-20-3c",
    name: "VVFケーブル 2.0mm-3C",
    aliases: ["VVF3C", "VVF2.0-3C", "VVF 3芯", "VVF3芯", "2.0-3C"],
    unit: "m",
    unitPrice: 360,
    costPrice: 160,
    category: "electric",
  },
  {
    id: "toms-vvf-16-2c",
    name: "VVFケーブル 1.6mm-2C",
    aliases: ["VVF1.6", "VVF1.6mm", "1.6-2C"],
    unit: "m",
    unitPrice: 220,
    costPrice: 95,
    category: "electric",
  },
  {
    id: "toms-pf-16",
    name: "PF管 16mm",
    aliases: ["PF管", "PF16", "PF φ16", "フレキ管", "CD管"],
    unit: "m",
    unitPrice: 180,
    costPrice: 70,
    category: "electric",
  },
  {
    id: "toms-pf-22",
    name: "PF管 22mm",
    aliases: ["PF22", "PF φ22", "PF管22"],
    unit: "m",
    unitPrice: 260,
    costPrice: 110,
    category: "electric",
  },
  {
    id: "toms-outlet-box",
    name: "取付ボックス（スイッチボックス）",
    aliases: ["ボックス", "取付ボックス", "スイッチボックス", "深型ボックス", "埋込ボックス"],
    unit: "個",
    unitPrice: 450,
    costPrice: 180,
    category: "electric",
  },
  {
    id: "toms-junction-box",
    name: "ジョイントボックス",
    aliases: ["ジョイント", "JB", "中継ボックス"],
    unit: "個",
    unitPrice: 680,
    costPrice: 280,
    category: "electric",
  },
  {
    id: "toms-outlet-duplex",
    name: "コンセント増設（2口）",
    aliases: ["コンセント", "コンセント増設", "2口コンセント", "電源増設"],
    unit: "口",
    unitPrice: 8500,
    costPrice: 2500,
    category: "outlet",
  },
  {
    id: "toms-cat6",
    name: "Cat6 LANケーブル敷設",
    aliases: ["LAN", "LANケーブル", "Cat6", "カテゴリ6", "ネットワーク配線"],
    unit: "m",
    unitPrice: 650,
    costPrice: 80,
    category: "lan",
  },
  {
    id: "toms-rj45",
    name: "RJ45モジュラープラグ加工",
    aliases: ["RJ45", "モジュラー", "LAN端子", "圧着"],
    unit: "本",
    unitPrice: 800,
    costPrice: 50,
    category: "lan",
  },
  {
    id: "toms-camera-outdoor",
    name: "屋外防犯カメラ設置",
    aliases: ["防犯カメラ", "カメラ", "屋外カメラ", "監視カメラ", "IPカメラ"],
    unit: "台",
    unitPrice: 35000,
    costPrice: 18000,
    category: "camera",
  },
  {
    id: "toms-nvr",
    name: "ネットワークビデオレコーダー（NVR）",
    aliases: ["NVR", "レコーダー", "録画機", "HDDレコーダー"],
    unit: "式",
    unitPrice: 85000,
    costPrice: 45000,
    category: "camera",
  },
  {
    id: "toms-poe-hub",
    name: "PoEハブ",
    aliases: ["PoE", "PoEスイッチ", "スイッチングハブ"],
    unit: "台",
    unitPrice: 18000,
    costPrice: 9000,
    category: "camera",
  },
  {
    id: "toms-led-ceiling",
    name: "LEDシーリングライト",
    aliases: ["LED", "シーリング", "照明", "LED照明"],
    unit: "台",
    unitPrice: 12000,
    costPrice: 5500,
    category: "lighting",
  },
  {
    id: "toms-wiring-labor",
    name: "配線工事費",
    aliases: ["配線工事", "電気工事", "配線", "工事費"],
    unit: "式",
    unitPrice: 25000,
    costPrice: 0,
    category: "labor",
  },
  {
    id: "toms-install-labor",
    name: "取付・設置工事",
    aliases: ["取付", "設置", "取付工事", "設置工事", "施工費"],
    unit: "式",
    unitPrice: 20000,
    costPrice: 0,
    category: "labor",
  },
  {
    id: "toms-setup-fee",
    name: "設定・動作確認費",
    aliases: ["設定費", "設定", "動作確認", "調整費", "試験調整", "試験・調整"],
    unit: "式",
    unitPrice: 15000,
    costPrice: 0,
    category: "labor",
  },
  {
    id: "toms-man-day",
    name: "標準人工（1人日）",
    aliases: ["人工", "人日", "作業員", "施工費（人工）", "労務"],
    unit: "日",
    unitPrice: 55000,
    costPrice: 0,
    category: "labor",
  },
  {
    id: "toms-travel",
    name: "出張費（近郊）",
    aliases: ["出張費", "交通費", "現地出張"],
    unit: "式",
    unitPrice: 5000,
    costPrice: 0,
    category: "other",
  },
] as const;

export interface TomsMasterSuggestV1 {
  query: string;
  matched: boolean;
  score: number;
  item: TomsMasterItemV1 | null;
  /** 上位候補（最大3件） */
  candidates: Array<{ item: TomsMasterItemV1; score: number }>;
}

function normalizeMasterQueryV1(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[ａ-ｚＡ-Ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/[\s　_\-ー・･/／()（）\[\]【】]/g, "")
    .trim();
}

/**
 * 品名とマスター項目の類似度（0〜1）。
 * 完全一致・包含・エイリアスを優先。
 */
export function scoreTomsMasterMatchV1(
  query: string,
  item: TomsMasterItemV1
): number {
  const q = normalizeMasterQueryV1(query);
  if (!q) return 0;
  const nameN = normalizeMasterQueryV1(item.name);
  if (q === nameN) return 1;
  if (nameN.includes(q) || q.includes(nameN)) return 0.92;

  let best = 0;
  for (const alias of item.aliases) {
    const a = normalizeMasterQueryV1(alias);
    if (!a) continue;
    if (q === a) best = Math.max(best, 0.98);
    else if (q.includes(a) || a.includes(q)) best = Math.max(best, 0.88);
    else if (q.length >= 3 && a.length >= 3) {
      // 先頭一致で弱マッチ
      const n = Math.min(q.length, a.length);
      let shared = 0;
      for (let i = 0; i < n; i += 1) {
        if (q[i] === a[i]) shared += 1;
        else break;
      }
      if (shared >= 3) best = Math.max(best, 0.55 + shared * 0.05);
    }
  }
  return Math.min(1, best);
}

/**
 * OCR 品名から TOMS マスター単価を提案。
 * 閾値未満は matched=false（既存単価は維持）。
 */
export function suggestTomsMasterPriceV1(
  query: string,
  opts?: { minScore?: number }
): TomsMasterSuggestV1 {
  const minScore = opts?.minScore ?? 0.55;
  const scored = TOMS_MASTER_ITEMS_V1.map((item) => ({
    item,
    score: scoreTomsMasterMatchV1(query, item),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const candidates = scored.slice(0, 3);
  if (!top || top.score < minScore) {
    return {
      query: String(query || ""),
      matched: false,
      score: top?.score ?? 0,
      item: null,
      candidates,
    };
  }
  return {
    query: String(query || ""),
    matched: true,
    score: top.score,
    item: top.item,
    candidates,
  };
}

/**
 * 明細配列へマスター単価を補完（unitPrice=0 のみ）。
 * 既存の明示単価は上書きしない。
 */
export function applyTomsMasterPricesToItemsV1<
  T extends { name: string; unitPrice: number; unit?: string; category?: string },
>(items: T[]): { items: T[]; appliedCount: number; suggestions: TomsMasterSuggestV1[] } {
  const suggestions: TomsMasterSuggestV1[] = [];
  let appliedCount = 0;
  const out = items.map((it) => {
    const price = Math.max(0, Math.round(Number(it.unitPrice) || 0));
    if (price > 0) {
      suggestions.push({
        query: it.name,
        matched: false,
        score: 0,
        item: null,
        candidates: [],
      });
      return it;
    }
    const sug = suggestTomsMasterPriceV1(it.name);
    suggestions.push(sug);
    if (!sug.matched || !sug.item) return it;
    appliedCount += 1;
    return {
      ...it,
      unitPrice: sug.item.unitPrice,
      unit: it.unit || sug.item.unit,
      category: it.category || sug.item.category,
    };
  });
  return { items: out, appliedCount, suggestions };
}

/** API 用: マスター一覧 */
export function listTomsMasterItemsV1(): TomsMasterItemV1[] {
  return [...TOMS_MASTER_ITEMS_V1];
}

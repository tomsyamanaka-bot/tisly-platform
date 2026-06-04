export type DemoEstimateType = "house" | "minpaku" | "factory";

const ESTIMATE_META: Record<
  DemoEstimateType,
  { title: string; customerLabel: string; totalYen: number; lines: Array<{ name: string; qty: number; unit: string; price: number }> }
> = {
  house: {
    title: "戸建てセキュリティ お見積り（デモ）",
    customerLabel: "山田様邸 — 戸建て",
    totalYen: 528000,
    lines: [
      { name: "防犯センサー・カメラ設置", qty: 1, unit: "式", price: 380000 },
      { name: "遠隔監視・通知 初期設定", qty: 1, unit: "式", price: 48000 },
      { name: "年間保守サポート", qty: 1, unit: "年", price: 100000 },
    ],
  },
  minpaku: {
    title: "民泊向けセキュリティ お見積り（デモ）",
    customerLabel: "民泊デモ物件",
    totalYen: 412000,
    lines: [
      { name: "チェックイン連動・スマートロック連携", qty: 1, unit: "式", price: 198000 },
      { name: "室内カメラ・騒音センサー", qty: 4, unit: "室", price: 42000 },
      { name: "清掃・鍵トラブル 通知パック", qty: 1, unit: "年", price: 64000 },
    ],
  },
  factory: {
    title: "工場・倉庫 セキュリティ お見積り（デモ）",
    customerLabel: "デモ工場 — 倉庫棟",
    totalYen: 892000,
    lines: [
      { name: "外周ビーム・ゲート連動", qty: 1, unit: "式", price: 420000 },
      { name: "倉庫内 温湿度・扉センサー", qty: 12, unit: "点", price: 28000 },
      { name: "24時間遠隔監視・出動連携", qty: 1, unit: "年", price: 176000 },
    ],
  },
};

function fmtYen(n: number): string {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
}

export function buildDemoEstimateHtml(type: DemoEstimateType): string {
  const m = ESTIMATE_META[type];
  const rows = m.lines
    .map(
      (l) =>
        `<tr><td>${l.name}</td><td class="num">${l.qty}</td><td>${l.unit}</td><td class="num">${fmtYen(l.price)}</td><td class="num">${fmtYen(l.qty * l.price)}</td></tr>`
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8"/>
  <title>${m.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; color: #222; }
    h1 { font-size: 1.25rem; color: #1a7f37; }
    .meta { color: #555; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f6f8fa; }
    .num { text-align: right; }
    .total { font-size: 1.2rem; font-weight: 700; margin-top: 1rem; text-align: right; }
    .badge { display: inline-block; background: #e8f5e9; color: #1a7f37; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; }
  </style>
</head>
<body>
  <span class="badge">営業デモ用サンプル</span>
  <h1>${m.title}</h1>
  <p class="meta">${m.customerLabel} · 発行日 ${new Date().toLocaleDateString("ja-JP")}</p>
  <table>
    <thead><tr><th>項目</th><th>数量</th><th>単位</th><th>単価</th><th>金額</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="total">合計（税込想定） ${fmtYen(m.totalYen)}</p>
  <p style="font-size:0.85rem;color:#888">PDF未生成時はこのHTMLをプレビューとしてご利用ください。</p>
</body>
</html>`;
}

export function getDemoEstimateMeta(type: DemoEstimateType) {
  const m = ESTIMATE_META[type];
  return {
    type,
    title: m.title,
    customerLabel: m.customerLabel,
    totalYen: m.totalYen,
    htmlPath: `/api/demo-kit/estimate-html/${type}`,
    previewLabel: "PDFプレビュー（HTML）",
  };
}

export function listDemoEstimateTypes(): DemoEstimateType[] {
  return ["house", "minpaku", "factory"];
}

/**
 * Gemini / Vision 応答から安全な <svg> のみ抽出
 * Markdown フェンスや危険タグを除去する
 */

/**
 * Markdown の ```svg ... ``` や前後説明文を剥がす
 */
export function stripMarkdownCodeFencesV1(raw: string): string {
  let text = String(raw ?? "").trim();
  if (!text) return "";

  // ```svg / ```xml / ``` フェンスを優先抽出
  const fenced = text.match(
    /```(?:svg|xml|html)?\s*([\s\S]*?)```/i
  );
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return text
    .replace(/^```(?:svg|xml|html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * 文字列から最初の <svg>...</svg> を切り出す
 */
export function extractSvgElementV1(raw: string): string | null {
  const text = stripMarkdownCodeFencesV1(raw);
  if (!text) return null;

  const match = text.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (!match?.[0]) return null;
  return match[0].trim();
}

/**
 * 抽出後 SVG の最終整形
 * script / イベント / 外部参照を除去し xmlns を保証
 */
export function finalizeSanitizedSvgV1(
  svgRaw: string
): string | null {
  let svg = String(svgRaw ?? "").trim();
  if (!/^<svg\b/i.test(svg) || !/<\/svg>/i.test(svg)) {
    return null;
  }

  // 危険要素（開始〜終了）を除去
  svg = svg.replace(
    /<\s*(script|foreignObject|style|image|use|a|iframe|object|embed)\b[\s\S]*?<\/\s*\1\s*>/gi,
    ""
  );
  // 自己閉じ危険要素
  svg = svg.replace(
    /<\s*(script|foreignObject|style|image|use|a|iframe|object|embed)\b[^>]*\/?\s*>/gi,
    ""
  );
  // インラインイベント・外部リンク
  svg = svg.replace(
    /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    ""
  );
  svg = svg.replace(
    /\shref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    ""
  );
  svg = svg.replace(
    /\sxlink:href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    ""
  );
  svg = svg.replace(/<!--[\s\S]*?-->/g, "");

  if (!/\sxmlns\s*=/i.test(svg)) {
    svg = svg.replace(
      /^<svg\b/i,
      '<svg xmlns="http://www.w3.org/2000/svg"'
    );
  }

  // 異常に長い応答は拒否（DoS 防止）
  if (svg.length > 500_000) {
    return null;
  }

  return svg;
}

/**
 * 公開 API: 生テキスト → 安全な SVG 文字列
 */
export function sanitizeAiWallSvgResponseV1(
  rawText: string
): string | null {
  const extracted = extractSvgElementV1(rawText);
  if (!extracted) return null;
  return finalizeSanitizedSvgV1(extracted);
}

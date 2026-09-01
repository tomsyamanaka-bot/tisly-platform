/**
 * 顧客向け UI 表示ラベル v1
 *
 * 内部 ID・英語表記はデータに残し、
 * 表示時のみ日本語・現場呼称へ変換する。
 */

/** 物件名から内部 ID・英語サブタイトルを除去 */
export function customerSiteTitleV1(
  raw: string | null | undefined
): string {
  const s = String(raw ?? "").trim();
  if (!s) return "TiSLY Security";
  const cleaned = s
    .replace(/\s*\(HOME-JP-[^)]+\)/gi, "")
    .replace(/\s*\(SEC-JP-[^)]+\)/gi, "")
    .replace(/\s*\(Toyoshima Residence\)/gi, "")
    .trim();
  return cleaned || s;
}

/** RP2350 基板名を現場呼称へ */
export function customerControllerLabelV1(
  raw: string | null | undefined
): string {
  const s = String(raw ?? "");
  if (/8CH|8回路|親機/.test(s) && /Relay|RP2350|親/.test(s)) {
    return "主装置（8回路）";
  }
  if (/6CH|6回路|子機/.test(s) && /Relay|RP2350|子/.test(s)) {
    return "子機（6回路）";
  }
  if (s.includes("Waveshare RP2350 8CH")) return "主装置（8回路）";
  if (s.includes("Waveshare RP2350 6CH")) return "子機（6回路）";
  return s;
}

/** DI/DO を入力/出力表記へ（顧客画面用） */
export function customerIoLabelV1(
  raw: string | null | undefined
): string {
  return String(raw ?? "")
    .replace(/\bDI(\d+)\b/g, "入力$1")
    .replace(/\bDO(\d+)\b/g, "出力$1");
}

/** 部屋ラベルから英語括弧を除去 */
export function customerRoomLabelV1(
  raw: string | null | undefined
): string {
  return String(raw ?? "")
    .replace(/（Main House）/g, "")
    .replace(/（Detached）/g, "")
    .replace(/\(Main House\)/gi, "")
    .replace(/\(Detached\)/gi, "")
    .trim();
}

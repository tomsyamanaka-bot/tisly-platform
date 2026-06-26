/** TOMS PDF HTML メタタグ — pdf-base-template 共通ラッパー用 */

export const TOMS_PDF_CHARSET_META = '<meta charset="UTF-8"/>';

export const TOMS_PDF_FONT_LINKS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"/>' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>' +
  '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet"/>';

/** 実機閲覧は device-width（右切れ防止）。印刷/Puppeteer は @page + @media print で A4 縦固定 */
export const TOMS_PDF_VIEWPORT_META =
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>`;

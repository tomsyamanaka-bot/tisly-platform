/** TOMS Official Layout v1.2 — A4 print-only PDF styles (no mobile breakpoints) */
export const TOMS_OFFICIAL_CORE_STYLES = `
.toms-official-header{display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem;margin-bottom:0.45rem}
.toms-official-header-main{flex:1;min-width:0}
.toms-official-header-side{flex:0 0 42%;min-width:0;text-align:right;font-size:0.62rem;line-height:1.28;color:#222}
.toms-official-title-band{display:inline-block;background:#d9d9d9;padding:0.28rem 0.9rem 0.28rem 0.55rem;margin:0 0 0.4rem}
.toms-official-title-band h1{margin:0;font-size:0.95rem;letter-spacing:0.22em;font-weight:700;color:#111;white-space:normal;word-break:keep-all}
.toms-official-addressee{margin:0 0 0.35rem;font-size:0.88rem;font-weight:700;color:#111;line-height:1.35}
.toms-official-field{margin:0 0 0.2rem;font-size:0.72rem;line-height:1.3}
.toms-official-field-label{font-weight:700;margin-right:0.4rem;white-space:nowrap}
.toms-official-notes-inline{color:#334155;font-size:0.68rem}
.toms-official-company{margin-bottom:0.35rem}
.toms-official-company-name{font-weight:700;font-size:0.66rem;margin-bottom:0.08rem}
.toms-official-meta{border-collapse:collapse;margin:0 0 0 auto;font-size:0.62rem}
.toms-official-meta th,.toms-official-meta td{padding:0.08rem 0 0.08rem 0.35rem;text-align:left;vertical-align:top}
.toms-official-meta th{font-weight:700;color:#333;white-space:nowrap}
.toms-official-meta td{color:#111;word-break:break-word;overflow-wrap:break-word}
.toms-official-amount{display:flex;justify-content:space-between;align-items:center;flex-wrap:nowrap;gap:0.5rem;margin:0.45rem 0 0.55rem;padding:0.45rem 0.75rem;border:2px solid #111;background:#fff}
.toms-official-amount-label{font-size:0.82rem;font-weight:700;letter-spacing:0.08em;white-space:nowrap;flex-shrink:0}
.toms-official-amount-value{font-size:1.15rem;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.toms-official-amount-tax{font-size:0.72rem;font-weight:600;margin-left:0.15rem}
.num{text-align:right;font-variant-numeric:tabular-nums}
.toms-official-totals{margin:0.15rem 0 0 auto;width:240px;max-width:45%;font-size:0.72rem}
.toms-official-totals div{display:flex;justify-content:space-between;padding:0.08rem 0;gap:0.5rem}
.toms-official-totals .grand{font-weight:800;font-size:0.82rem;border-top:1px solid #000;margin-top:0.12rem;padding-top:0.15rem}
.toms-official-totals .discount-row{color:#92400e}
.toms-official-tax-breakdown{margin-top:0.15rem;padding-top:0.15rem;border-top:1px dashed #666;font-size:0.68rem;color:#333}
.toms-official-tax-breakdown div{display:flex;justify-content:space-between;padding:0.06rem 0}
.toms-official-notes{margin-top:0.4rem;font-size:0.72rem;line-height:1.35}
.toms-official-notes strong{font-weight:700}
`;

/** PDF専用 A4 横書き明細テーブル（見積・請求）— table-layout:fixed 禁止 */
export const PDF_A4_LINE_ITEMS_STYLES = `
table.pdf-a4-line-items{width:100%;border-collapse:collapse;margin:0 0 0.35rem;border:1px solid #000;table-layout:auto}
table.pdf-a4-line-items th,table.pdf-a4-line-items td{border:1px solid #000;padding:0.12rem 0.28rem;font-size:7.5pt;vertical-align:top;line-height:1.35}
table.pdf-a4-line-items thead th{background:#b4c7e7;font-weight:700;text-align:center;writing-mode:horizontal-tb !important;text-orientation:mixed !important;white-space:nowrap}
table.pdf-a4-line-items tbody tr{background:#eef3fb}
table.pdf-a4-line-items .col-no{width:6%;text-align:center;white-space:nowrap}
table.pdf-a4-line-items .col-desc{width:45%;min-width:45%;text-align:left;writing-mode:horizontal-tb !important;text-orientation:mixed !important;white-space:normal !important;word-break:keep-all !important;overflow-wrap:break-word !important;line-height:1.35}
table.pdf-a4-line-items .col-qty{width:9%;text-align:center;white-space:nowrap}
table.pdf-a4-line-items .col-unit{width:9%;text-align:center;white-space:nowrap}
table.pdf-a4-line-items .col-price{width:15%;text-align:right;white-space:nowrap}
table.pdf-a4-line-items .col-amount{width:16%;text-align:right;white-space:nowrap}
`;

export const TOMS_PDF_CHARSET_META = '<meta charset="UTF-8"/>';

export const TOMS_PDF_FONT_LINKS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"/>' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>' +
  '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet"/>';

/** PDF専用 — スマホ viewport を使わない（A4 794px 固定） */
export const TOMS_PDF_VIEWPORT_META =
  '<meta name="viewport" content="width=794, initial-scale=1"/>';

export const TOMS_PDF_STYLES = `
body{font-family:"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",system-ui,sans-serif;margin:0;padding:6mm 8mm;color:#111;background:#fff;font-size:9pt;line-height:1.32;word-break:normal;overflow-wrap:break-word;-webkit-text-size-adjust:100%;writing-mode:horizontal-tb;text-orientation:mixed}
.doc{max-width:190mm;width:190mm;min-width:190mm;margin:0 auto}
.doc.single-page{page-break-inside:avoid;max-height:287mm}
.doc.with-photos .photo-section-title{page-break-before:auto}
${TOMS_OFFICIAL_CORE_STYLES}
${PDF_A4_LINE_ITEMS_STYLES}
.intro{margin:0.35rem 0 0.5rem;font-size:0.78rem}
.bank-block{margin-top:0.65rem;padding:0.5rem 0.65rem;border:1px solid #000;font-size:0.72rem;line-height:1.35}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:0.35rem;margin-top:0.35rem}
.photo-slot{border:1px solid #ccc;min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8;font-size:0.62rem;overflow:hidden;page-break-inside:avoid}
.photo-slot img{max-width:100%;max-height:88px;object-fit:contain}
.photo-caption{font-size:0.58rem;margin-top:0.12rem;color:#64748b}
.photo-section-title{font-size:0.82rem;margin:0.65rem 0 0.25rem}
.seal-placeholder{position:absolute;right:2rem;bottom:2rem;width:64px;height:64px;border:2px solid #cbd5e1;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.82rem}
.doc-footer{position:relative;min-height:64px;margin-top:0.85rem}
@media print{
  body{padding:7mm 9mm}
  .doc{max-width:none;width:auto;min-width:0}
  table.pdf-a4-line-items thead{display:table-header-group}
  table.pdf-a4-line-items tbody tr{page-break-inside:avoid}
}
`;

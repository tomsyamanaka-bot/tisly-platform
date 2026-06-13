/** TOMS Official Layout v1.2 — A4 print-only PDF styles (no mobile breakpoints) */
export const TOMS_OFFICIAL_CORE_STYLES = `
.toms-official-header{display:flex;justify-content:space-between;align-items:flex-start;gap:0.55rem;margin-bottom:0.3rem}
.toms-official-header-main{flex:1;min-width:0}
.toms-official-header-side{flex:0 0 40%;min-width:0;text-align:right;font-size:0.58rem;line-height:1.22;color:#222}
.toms-official-title-band{display:inline-block;background:#d9d9d9;padding:0.2rem 0.75rem 0.2rem 0.45rem;margin:0 0 0.28rem}
.toms-official-title-band h1{margin:0;font-size:0.88rem;letter-spacing:0.18em;font-weight:700;color:#111;white-space:normal;word-break:keep-all}
.toms-official-addressee{margin:0 0 0.22rem;font-size:0.82rem;font-weight:700;color:#111;line-height:1.28}
.toms-official-field{margin:0 0 0.12rem;font-size:0.68rem;line-height:1.22}
.toms-official-field-label{font-weight:700;margin-right:0.35rem;white-space:nowrap}
.toms-official-notes-inline{color:#334155;font-size:0.64rem}
.toms-official-company{margin-bottom:0.25rem}
.toms-official-company-name{font-weight:700;font-size:0.62rem;margin-bottom:0.06rem}
.toms-official-meta{border-collapse:collapse;margin:0 0 0 auto;font-size:0.58rem}
.toms-official-meta th,.toms-official-meta td{padding:0.05rem 0 0.05rem 0.28rem;text-align:left;vertical-align:top}
.toms-official-meta th{font-weight:700;color:#333;white-space:nowrap}
.toms-official-meta td{color:#111;word-break:break-word;overflow-wrap:break-word}
.toms-official-amount{display:flex;justify-content:space-between;align-items:center;flex-wrap:nowrap;gap:0.4rem;margin:0.3rem 0 0.38rem;padding:0.32rem 0.6rem;border:2px solid #111;background:#fff}
.toms-official-amount-label{font-size:0.76rem;font-weight:700;letter-spacing:0.06em;white-space:nowrap;flex-shrink:0}
.toms-official-amount-value{font-size:1.05rem;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.toms-official-amount-tax{font-size:0.66rem;font-weight:600;margin-left:0.12rem}
.num{text-align:right;font-variant-numeric:tabular-nums}
.toms-official-totals{margin:0.1rem 0 0 auto;width:220px;max-width:44%;font-size:0.68rem}
.toms-official-totals div{display:flex;justify-content:space-between;padding:0.05rem 0;gap:0.4rem}
.toms-official-totals .grand{font-weight:800;font-size:0.76rem;border-top:1px solid #000;margin-top:0.08rem;padding-top:0.1rem}
.toms-official-totals .discount-row{color:#92400e}
.toms-official-tax-breakdown{margin-top:0.1rem;padding-top:0.1rem;border-top:1px dashed #666;font-size:0.64rem;color:#333}
.toms-official-tax-breakdown div{display:flex;justify-content:space-between;padding:0.04rem 0}
.toms-official-notes{margin-top:0.28rem;font-size:0.68rem;line-height:1.28}
.toms-official-notes strong{font-weight:700}
`;

/** PDF専用 A4 横書き明細テーブル（見積・請求） */
export const PDF_A4_LINE_ITEMS_STYLES = `
table.pdf-a4-line-items{width:100%;border-collapse:collapse;margin:0 0 0.25rem;border:1px solid #000;table-layout:fixed}
table.pdf-a4-line-items th,table.pdf-a4-line-items td{border:1px solid #000;padding:0.06rem 0.2rem;font-size:7pt;vertical-align:middle;line-height:1.22}
table.pdf-a4-line-items thead th{background:#b4c7e7;font-weight:700;text-align:center;writing-mode:horizontal-tb !important;text-orientation:mixed !important;white-space:nowrap;letter-spacing:0.02em}
table.pdf-a4-line-items tbody tr{background:#eef3fb}
table.pdf-a4-line-items .col-no{width:8%;text-align:center;white-space:nowrap}
table.pdf-a4-line-items .col-desc{width:42%;min-width:42%;text-align:left;writing-mode:horizontal-tb !important;text-orientation:mixed !important;white-space:normal !important;word-break:keep-all !important;overflow-wrap:break-word !important;line-height:1.22;vertical-align:top}
table.pdf-a4-line-items .col-qty{width:10%;text-align:center;white-space:nowrap}
table.pdf-a4-line-items .col-unit{width:10%;text-align:center;white-space:nowrap}
table.pdf-a4-line-items .col-price{width:15%;text-align:right;white-space:nowrap}
table.pdf-a4-line-items .col-amount{width:15%;text-align:right;white-space:nowrap}
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
body{font-family:"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",system-ui,sans-serif;margin:0;padding:5mm 7mm;color:#111;background:#fff;font-size:8.5pt;line-height:1.28;word-break:normal;overflow-wrap:break-word;-webkit-text-size-adjust:100%;writing-mode:horizontal-tb;text-orientation:mixed;padding-bottom:calc(5mm + env(safe-area-inset-bottom, 0px))}
.doc{max-width:190mm;width:190mm;min-width:190mm;margin:0 auto;box-sizing:border-box}
.doc.single-page{page-break-inside:avoid;max-height:287mm}
.doc.with-photos .photo-section-title{page-break-before:auto}
.doc-invoice-footer{margin-top:0.45rem;padding-bottom:calc(8mm + env(safe-area-inset-bottom, 12px))}
${TOMS_OFFICIAL_CORE_STYLES}
${PDF_A4_LINE_ITEMS_STYLES}
.intro{margin:0.28rem 0 0.38rem;font-size:0.72rem}
.bank-block{margin-top:0.35rem;padding:0.38rem 0.55rem;border:1px solid #000;font-size:0.68rem;line-height:1.28;page-break-inside:avoid}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:0.28rem;margin-top:0.28rem}
.photo-slot{border:1px solid #ccc;min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8;font-size:0.58rem;overflow:hidden;page-break-inside:avoid}
.photo-slot img{max-width:100%;max-height:80px;object-fit:contain}
.photo-caption{font-size:0.54rem;margin-top:0.08rem;color:#64748b}
.photo-section-title{font-size:0.76rem;margin:0.5rem 0 0.18rem}
.seal-placeholder{position:absolute;right:1.5rem;bottom:1.5rem;width:56px;height:56px;border:2px solid #cbd5e1;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.76rem}
.doc-footer{position:relative;min-height:48px;margin-top:0.5rem}
@media print{
  body{padding:6mm 8mm;padding-bottom:calc(6mm + env(safe-area-inset-bottom, 0px))}
  .doc{max-width:none;width:auto;min-width:0}
  table.pdf-a4-line-items thead{display:table-header-group}
  table.pdf-a4-line-items tbody tr{page-break-inside:avoid}
}
`;

/** TOMS Official Layout v1.1 — shared header / table / totals */
export const TOMS_OFFICIAL_CORE_STYLES = `
.toms-official-header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:0.55rem}
.toms-official-header-main{flex:1;min-width:0}
.toms-official-header-side{flex:0 0 210px;min-width:190px;text-align:right;font-size:0.76rem;line-height:1.5;color:#222}
.toms-official-title-band{display:inline-block;background:#d9d9d9;padding:0.4rem 1.5rem 0.4rem 0.75rem;margin:0 0 0.65rem}
.toms-official-title-band h1{margin:0;font-size:1.28rem;letter-spacing:0.32em;font-weight:700;color:#111;white-space:nowrap}
.toms-official-addressee{margin:0 0 0.55rem;font-size:1.15rem;font-weight:700;color:#111;line-height:1.35}
.toms-official-field{margin:0 0 0.3rem;font-size:0.9rem;line-height:1.45}
.toms-official-field-label{font-weight:700;margin-right:0.4rem;white-space:nowrap}
.toms-official-notes-inline{color:#334155;font-size:0.84rem}
.toms-official-company{margin-bottom:0.45rem}
.toms-official-company-name{font-weight:700;font-size:0.82rem;margin-bottom:0.08rem}
.toms-official-meta{border-collapse:collapse;margin:0 0 0 auto;font-size:0.76rem}
.toms-official-meta th,.toms-official-meta td{padding:0.1rem 0 0.1rem 0.4rem;text-align:left;vertical-align:top}
.toms-official-meta th{font-weight:700;color:#333;white-space:nowrap}
.toms-official-meta td{color:#111;word-break:break-all}
.toms-official-amount{display:flex;justify-content:space-between;align-items:center;flex-wrap:nowrap;gap:0.5rem;margin:0.7rem 0 0.85rem;padding:0.6rem 0.9rem;border:2px solid #111;background:#fff}
.toms-official-amount-label{font-size:0.92rem;font-weight:700;letter-spacing:0.08em;white-space:nowrap;flex-shrink:0}
.toms-official-amount-value{font-size:1.48rem;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.toms-official-amount-tax{font-size:0.8rem;font-weight:600;margin-left:0.15rem}
table.toms-official-items{width:100%;border-collapse:collapse;margin:0 0 0.65rem;border:1px solid #000;table-layout:fixed}
table.toms-official-items th,table.toms-official-items td{border:1px solid #000;padding:0.35rem 0.45rem;font-size:0.82rem;vertical-align:middle;line-height:1.32;min-height:1.65rem}
table.toms-official-items thead th{background:#b4c7e7;font-weight:700;text-align:center}
table.toms-official-items tbody tr{background:#eef3fb;height:1.9rem}
table.toms-official-items .col-no{width:2rem;text-align:center}
table.toms-official-items .col-desc{text-align:left;word-break:break-word;white-space:pre-wrap}
table.toms-official-items .col-qty{width:3.2rem}
table.toms-official-items .col-price{width:5.2rem}
table.toms-official-items .col-amount{width:6.2rem}
.num{text-align:right;font-variant-numeric:tabular-nums}
.toms-official-totals{margin:0.3rem 0 0 auto;width:270px;max-width:100%;font-size:0.84rem}
.toms-official-totals div{display:flex;justify-content:space-between;padding:0.16rem 0;gap:0.5rem}
.toms-official-totals .grand{font-weight:800;font-size:0.98rem;border-top:1px solid #000;margin-top:0.2rem;padding-top:0.28rem}
.toms-official-totals .discount-row{color:#92400e}
.toms-official-tax-breakdown{margin-top:0.3rem;padding-top:0.28rem;border-top:1px dashed #666;font-size:0.78rem;color:#333}
.toms-official-tax-breakdown div{display:flex;justify-content:space-between;padding:0.08rem 0}
.toms-official-notes{margin-top:0.85rem;font-size:0.82rem;line-height:1.5}
.toms-official-notes strong{font-weight:700}
.toms-official-compact .toms-official-header{margin-bottom:0.35rem;gap:0.65rem}
.toms-official-compact .toms-official-title-band{margin-bottom:0.4rem;padding:0.28rem 0.9rem 0.28rem 0.55rem}
.toms-official-compact .toms-official-title-band h1{font-size:0.95rem;letter-spacing:0.22em}
.toms-official-compact .toms-official-addressee{font-size:0.88rem;margin-bottom:0.35rem}
.toms-official-compact .toms-official-field{font-size:0.72rem;margin-bottom:0.2rem;line-height:1.3}
.toms-official-compact .toms-official-notes-inline{font-size:0.68rem}
.toms-official-compact .toms-official-header-side{flex:0 0 42%;min-width:0;font-size:0.62rem;line-height:1.28}
.toms-official-compact .toms-official-company-name{font-size:0.66rem}
.toms-official-compact .toms-official-meta{font-size:0.62rem}
`;

export const TOMS_PDF_VIEWPORT_META =
  '<meta name="viewport" content="width=device-width, initial-scale=1"/>';

export const TOMS_PDF_STYLES = `
body{font-family:"Hiragino Sans","Yu Gothic","Meiryo",sans-serif;margin:0;padding:8mm 10mm;color:#111;background:#fff;font-size:10pt;line-height:1.45;word-break:keep-all;overflow-wrap:break-word;-webkit-text-size-adjust:100%}
.doc{max-width:800px;min-width:280px;margin:0 auto}
.doc.single-page{page-break-inside:auto}
.doc.with-photos .photo-section-title{page-break-before:auto}
${TOMS_OFFICIAL_CORE_STYLES}
.intro{margin:0.45rem 0 0.65rem;font-size:0.86rem}
.bank-block{margin-top:0.85rem;padding:0.65rem 0.8rem;border:1px solid #000;font-size:0.82rem;line-height:1.45}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:0.45rem;margin-top:0.45rem}
.photo-slot{border:1px solid #ccc;min-height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8;font-size:0.68rem;overflow:hidden;page-break-inside:avoid}
.photo-slot img{max-width:100%;max-height:100px;object-fit:contain}
.photo-caption{font-size:0.62rem;margin-top:0.18rem;color:#64748b}
.photo-section-title{font-size:0.92rem;margin:0.85rem 0 0.3rem}
.seal-placeholder{position:absolute;right:2rem;bottom:2rem;width:64px;height:64px;border:2px solid #cbd5e1;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.82rem}
.doc-footer{position:relative;min-height:80px;margin-top:1.1rem}
@media screen and (max-width:520px){
  body{padding:6mm 8mm;font-size:9.5pt}
  .doc{min-width:0}
  .toms-official-header{flex-direction:column;gap:0.45rem}
  .toms-official-header-side{flex:1 1 auto;width:100%;text-align:left}
  .toms-official-title-band h1{letter-spacing:0.18em;font-size:1.1rem}
  .toms-official-amount-value{font-size:1.28rem}
  table.toms-official-items th,table.toms-official-items td{padding:0.28rem 0.32rem;font-size:0.76rem}
  .toms-official-totals{width:100%}
}
@media print{
  body{padding:7mm 9mm}
  .doc{max-width:none}
  table.toms-official-items thead{display:table-header-group}
  table.toms-official-items tbody tr{page-break-inside:avoid}
}
`;

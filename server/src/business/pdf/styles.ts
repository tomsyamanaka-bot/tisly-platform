export const TOMS_PDF_STYLES = `
body{font-family:"Hiragino Sans","Yu Gothic",sans-serif;margin:0;padding:1.5rem 2rem;color:#0f172a;background:#fff;font-size:10pt}
.doc{max-width:800px;margin:0 auto}
.doc.single-page{page-break-inside:auto}
.doc.with-photos .photo-section-title{page-break-before:auto}
.toms-doc-header{display:flex;justify-content:space-between;align-items:flex-start;gap:1.5rem;margin-bottom:1.25rem;padding-bottom:0.75rem;border-bottom:2px solid #0d9488}
.toms-doc-left{flex:1;min-width:0}
.toms-doc-right{flex:0 0 260px;text-align:right;font-size:0.82rem;line-height:1.55;color:#334155}
.toms-doc-title{font-size:1.75rem;margin:0 0 1rem;letter-spacing:0.2em;font-weight:700}
.toms-addressee{font-size:1.05rem;margin:0 0 0.75rem;font-weight:600;border-bottom:1px solid #cbd5e1;padding-bottom:0.35rem;display:inline-block}
.toms-subject{margin:0;font-size:0.95rem;line-height:1.5}
.toms-subject-label{font-weight:600;margin-right:0.35rem}
.toms-meta-table{border-collapse:collapse;margin:0 0 0.5rem auto;font-size:0.82rem}
.toms-meta-table th,.toms-meta-table td{padding:0.15rem 0 0.15rem 0.5rem;text-align:left;vertical-align:top}
.toms-meta-table th{font-weight:600;color:#475569;white-space:nowrap}
.toms-meta-table td{color:#0f172a}
.toms-company-block{margin-top:0.35rem}
.toms-company-name{font-weight:600;font-size:0.88rem;margin-bottom:0.15rem}
.amount-banner{margin:1rem 0 1.25rem;padding:1rem 1.25rem;background:#f0fdfa;border:2px solid #0d9488;border-radius:4px;text-align:center}
.amount-banner-label{font-size:0.95rem;font-weight:600;color:#0f766e;margin-bottom:0.35rem;letter-spacing:0.1em}
.amount-banner-total{font-size:1.85rem;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums}
.amount-tax-note{font-size:0.85rem;font-weight:500;color:#475569;margin-left:0.25rem}
header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d9488;padding-bottom:1rem;margin-bottom:1rem}
.logo{max-height:48px;opacity:0.85}
.company{font-size:0.82rem;color:#475569;line-height:1.55;text-align:right}
h1{font-size:1.5rem;margin:0 0 0.25rem;letter-spacing:0.15em}
.meta{color:#64748b;font-size:0.9rem}
.doc-no{font-weight:600;color:#0f172a}
table.header-table{width:100%;border-collapse:collapse;margin:0.75rem 0 1rem;font-size:0.9rem}
table.header-table th,table.header-table td{border:1px solid #e2e8f0;padding:0.4rem 0.65rem;vertical-align:top}
table.header-table th.hdr-label{width:7.5rem;background:#f1f5f9;text-align:left;font-weight:600;color:#334155}
table.header-table td.hdr-value{line-height:1.45}
.intro{margin:0.5rem 0 0.75rem;font-size:0.92rem}
table.items{width:100%;border-collapse:collapse;margin:0.75rem 0 1rem}
table.items th,table.items td{border:1px solid #94a3b8;padding:0.4rem 0.55rem;font-size:0.85rem;vertical-align:top}
table.items th{background:#f1f5f9;text-align:center;font-weight:600}
table.toms-items .col-no{width:2.2rem;text-align:center}
table.toms-items .col-desc{text-align:left;line-height:1.5;word-break:break-word;white-space:pre-wrap}
table.toms-items .col-qty{width:3.5rem}
table.toms-items .col-price{width:5.5rem}
table.toms-items .col-amount{width:6.5rem}
table.toms-items tbody tr{page-break-inside:avoid}
.num{text-align:right;font-variant-numeric:tabular-nums}
.totals{margin:0.75rem 0 0 auto;width:260px;font-size:0.88rem}
.totals div{display:flex;justify-content:space-between;padding:0.2rem 0}
.totals .grand{font-weight:bold;font-size:1rem;border-top:2px solid #0d9488;margin-top:0.35rem;padding-top:0.35rem}
.notes{margin-top:1rem;padding:0.75rem 0.85rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;font-size:0.85rem;line-height:1.45}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-top:0.5rem}
.photo-slot{border:1px solid #e2e8f0;min-height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8;font-size:0.7rem;overflow:hidden;page-break-inside:avoid}
.photo-slot img{max-width:100%;max-height:100px;object-fit:cover}
.photo-caption{font-size:0.65rem;margin-top:0.2rem;color:#64748b}
.photo-section-title{font-size:0.95rem;margin:1rem 0 0.35rem}
.bank-block{margin-top:1rem;padding:0.75rem 0.85rem;border:1px solid #e2e8f0;border-radius:4px;font-size:0.88rem;line-height:1.5}
.qr-placeholder{position:absolute;right:1rem;top:1rem;width:72px;height:72px;border:2px dashed #94a3b8;display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:#64748b}
.seal-placeholder{position:absolute;right:2rem;bottom:2rem;width:64px;height:64px;border:2px solid #cbd5e1;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem}
.doc-footer{position:relative;min-height:80px;margin-top:1.25rem}
.toms-estimate-head{margin-bottom:1rem;padding-bottom:0.5rem;border-bottom:2px solid #0d9488}
.toms-meta-inline{margin:0.5rem 0 0}
.toms-company-footer{margin-top:1.5rem;padding-top:0.75rem;border-top:2px solid #94a3b8;font-size:0.88rem;line-height:1.6;color:#334155}
@media print{
  body{padding:0.75rem 1rem}
  .doc{max-width:none}
  table.toms-items thead{display:table-header-group}
  table.toms-items tbody tr{page-break-inside:avoid}
}
`;

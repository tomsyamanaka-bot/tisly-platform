export const TOMS_PDF_STYLES = `
body{font-family:"Hiragino Sans","Yu Gothic",sans-serif;margin:0;padding:2rem;color:#0f172a;background:#fff}
.doc{max-width:800px;margin:0 auto}
.doc.single-page{page-break-inside:avoid}
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
.intro{margin:0.75rem 0 0.5rem;font-size:0.95rem}
table.items{width:100%;border-collapse:collapse;margin:1rem 0}
table.items th,table.items td{border:1px solid #e2e8f0;padding:0.5rem 0.65rem;font-size:0.88rem;vertical-align:top}
table.items th{background:#f1f5f9;text-align:center;font-weight:600}
table.toms-items .col-no{width:2.5rem;text-align:center}
table.toms-items .col-desc{text-align:left;line-height:1.45}
table.toms-items .col-qty{width:4rem}
table.toms-items .col-price{width:6.5rem}
table.toms-items .col-amount{width:7rem}
.num{text-align:right;font-variant-numeric:tabular-nums}
.totals{margin-left:auto;width:280px}
.totals div{display:flex;justify-content:space-between;padding:0.25rem 0}
.totals .grand{font-weight:bold;font-size:1.1rem;border-top:2px solid #0d9488;margin-top:0.5rem;padding-top:0.5rem}
.notes{margin-top:1rem;padding:0.85rem;background:#f8fafc;border-radius:8px;font-size:0.88rem;line-height:1.45}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-top:0.75rem}
.photo-slot{border:1px solid #e2e8f0;min-height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8;font-size:0.7rem;overflow:hidden}
.photo-slot img{max-width:100%;max-height:100px;object-fit:cover}
.photo-caption{font-size:0.65rem;margin-top:0.2rem;color:#64748b}
.bank-block{margin-top:1rem;padding:0.85rem 1rem;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem;line-height:1.5}
.qr-placeholder{position:absolute;right:1rem;top:1rem;width:72px;height:72px;border:2px dashed #94a3b8;display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:#64748b}
.seal-placeholder{position:absolute;right:2rem;bottom:2rem;width:64px;height:64px;border:2px solid #cbd5e1;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem}
.doc-footer{position:relative;min-height:80px;margin-top:1.5rem}
@media print{
  body{padding:0.5rem}
  .doc.single-page{max-height:100vh;overflow:hidden}
  .doc.with-photos{page-break-after:auto}
}
`;

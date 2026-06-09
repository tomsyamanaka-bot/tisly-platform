export function buildReportHtml(meta, sections) {
    const rows = sections
        .map((s) => `<section><h2>${s.title}</h2><ul>${s.items
        .map((i) => `<li><strong>${i.label}:</strong> ${i.value}</li>`)
        .join("")}</ul></section>`)
        .join("");
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/>
<title>${meta.reportType} — ${meta.customerName}</title></head><body>
<h1>${meta.customerName} — ${meta.reportType === "monthly" ? "月次" : "週次"}レポート</h1>
<p>Export: ${meta.exportId} · ${meta.generatedAt}</p>
${rows}
<p><em>PDF: Puppeteer integration TODO</em></p>
</body></html>`;
}

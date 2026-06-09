import { DEFAULT_PDF_OPTIONS, isPdfPuppeteerEnabled } from "./pdf-options.js";
import { wrapReportHtml } from "./html-template.js";
import { logAudit } from "../../provisioning/audit-log.js";
import { getQnapMode } from "../../qnap/smb-client.js";
async function tryPuppeteer(html, options) {
    if (!options.preferPuppeteer)
        return null;
    try {
        const mod = await import("puppeteer");
        const browser = await mod.default.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: "networkidle0" });
            const pdf = await page.pdf({
                format: options.format ?? "A4",
                printBackground: options.printBackground ?? true,
                margin: options.margin,
            });
            return Buffer.from(pdf);
        }
        finally {
            await browser.close();
        }
    }
    catch {
        return null;
    }
}
function qnapArchiveMeta(exportId) {
    const mode = getQnapMode();
    if (mode === "real") {
        return {
            mode: "real",
            path: exportId ? `/TiSLY/reports/${exportId}.pdf` : undefined,
            todo: exportId ? undefined : "export_id required for archive path",
        };
    }
    return {
        mode: "mock",
        path: exportId ? `data/qnap-archive/reports/${exportId}.pdf` : undefined,
        todo: "QNAP_MODE=real + SMB credentials for production archive",
    };
}
export async function renderReportPdf(html, title, options = {}, context = {}) {
    const opts = { ...DEFAULT_PDF_OPTIONS, ...options };
    const wrapped = wrapReportHtml(html, title);
    const exportId = context.exportId;
    const pdfBuf = await tryPuppeteer(wrapped, opts);
    const qnapArchive = qnapArchiveMeta(exportId);
    if (pdfBuf) {
        if (context.customerId && exportId) {
            logAudit({
                tenantId: context.customerId,
                action: "report.pdf_render",
                targetType: "report_export",
                targetId: exportId,
                afterJson: { engine: "puppeteer", format: "pdf", qnapArchive },
            });
        }
        return {
            format: "pdf",
            buffer: pdfBuf,
            engine: "puppeteer",
            export_id: exportId,
            qnapArchive,
        };
    }
    if (context.customerId && exportId) {
        logAudit({
            tenantId: context.customerId,
            action: "report.pdf_fallback",
            targetType: "report_export",
            targetId: exportId,
            afterJson: {
                engine: "html-placeholder",
                puppeteerEnabled: isPdfPuppeteerEnabled(),
                qnapArchive,
            },
        });
    }
    return {
        format: "html",
        buffer: Buffer.from(wrapped, "utf-8"),
        engine: "html-placeholder",
        export_id: exportId,
        pdfTodo: isPdfPuppeteerEnabled()
            ? "puppeteer not installed — npm install puppeteer (optional dependency)"
            : "Set TISLY_PDF_PUPPETEER=true and install puppeteer for PDF output",
        qnapArchive,
    };
}

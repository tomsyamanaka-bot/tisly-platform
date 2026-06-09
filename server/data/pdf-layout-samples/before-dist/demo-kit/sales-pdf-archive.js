/**
 * Phase981–1000 — 営業デモ用 PDF / QNAP mock 配置メタ
 */
import fs from "fs";
import path from "path";
import { buildDemoEstimateHtml, listDemoEstimateTypes } from "./demo-pdf-estimate.js";
import { getPdfRenderMode, htmlToPdfBuffer } from "../business/pdf/render.js";
const QNAP_MOCK_ROOT = path.join(process.cwd(), "uploads", "qnap-mock");
export async function buildSalesPdfArchive() {
    const renderMode = getPdfRenderMode();
    const entries = [];
    for (const type of listDemoEstimateTypes()) {
        const html = buildDemoEstimateHtml(type);
        let pdfUrl = null;
        let qnapMockPath = null;
        const pdfBuf = await htmlToPdfBuffer(html);
        if (pdfBuf) {
            const dir = path.join(process.cwd(), "uploads", "sales-demo", "pdfs");
            fs.mkdirSync(dir, { recursive: true });
            const fname = `EST-DEMO-${type}.pdf`;
            const full = path.join(dir, fname);
            fs.writeFileSync(full, pdfBuf);
            pdfUrl = `/uploads/sales-demo/pdfs/${fname}`;
            const qnapDir = path.join(QNAP_MOCK_ROOT, "SALES-DEMO", "02_見積書");
            fs.mkdirSync(qnapDir, { recursive: true });
            const qnapFile = path.join(qnapDir, fname);
            fs.copyFileSync(full, qnapFile);
            qnapMockPath = `uploads/qnap-mock/SALES-DEMO/02_見積書/${fname}`;
        }
        entries.push({
            type,
            title: type,
            htmlUrl: `/api/demo-kit/estimate-html/${type}`,
            pdfUrl,
            qnapMockPath,
            renderMode,
        });
    }
    return {
        renderMode,
        qnapMockRoot: QNAP_MOCK_ROOT,
        entries,
    };
}

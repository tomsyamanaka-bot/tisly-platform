import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { businessUploadsDir } from "../business-store.js";
import { generateQnapSpecificationFilePath, generateQnapSpecificationFolderPath, } from "./qnapService.js";
import { createEstimateCandidateFromDrawingPlan } from "./estimateFromDrawingService.js";
import { listDrawingSymbols } from "../drawing-store.js";
function minimalPdfBuffer(title, lines) {
    const text = [title, "", ...lines].join("\n");
    const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const stream = `BT /F1 11 Tf 40 750 Td (${escaped.slice(0, 800)}) Tj ET`;
    const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>endobj
4 0 obj<< /Length ${stream.length} >>stream
${stream}
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
trailer<< /Size 5 /Root 1 0 R >>
startxref
400
%%EOF`;
    return Buffer.from(pdf, "utf8");
}
export function buildSpecificationPdfLines(project, plan, doc) {
    const candidate = createEstimateCandidateFromDrawingPlan(plan);
    const lib = listDrawingSymbols();
    return [
        "【表紙】",
        doc.title,
        `案件番号: ${project.projectNo}`,
        `顧客: ${project.customerName}`,
        `件名: ${project.title}`,
        "",
        "【工事概要】",
        doc.overview || project.title,
        "",
        "【機器配置】",
        `記号 ${plan.symbols.length} 点 / ルート ${plan.routes.length} 本`,
        ...plan.symbols.slice(0, 12).map((s) => {
            const def = lib.find((x) => x.id === s.symbolId);
            return `- ${def?.label ?? s.label} (${Math.round(s.x)},${Math.round(s.y)})`;
        }),
        "",
        "【使用部材】",
        candidate.summary,
        "",
        "【配線・配管ルート】",
        ...candidate.lines.filter((l) => l.source === "route").map((l) => `- ${l.name}: ${l.quantity}${l.unit}`),
        "",
        "【施工内容】",
        doc.workSummary || "別紙施工図に基づく施工",
        "",
        "【注意事項】",
        doc.notes || plan.notes || "現場条件により変更の可能性があります",
        "",
        `QNAP予定: ${generateQnapSpecificationFolderPath(project)}`,
        `template: specification_v1`,
    ];
}
export function generateSpecificationPdf(project, plan, doc) {
    const fileName = path.basename(generateQnapSpecificationFilePath(project));
    const dir = businessUploadsDir(project.id, "specifications");
    const full = path.join(dir, fileName);
    const lines = buildSpecificationPdfLines(project, plan, doc);
    fs.writeFileSync(full, minimalPdfBuffer(doc.title, lines));
    const pdfPath = `/uploads/business/${project.id}/specifications/${fileName}`;
    return { pdfPath, qnapPath: generateQnapSpecificationFilePath(project) };
}
export function createSpecificationDocumentFromPlan(project, plan, input) {
    const now = new Date().toISOString();
    const title = input?.title ?? `仕様書 — ${project.title}`;
    const docBase = {
        title,
        overview: input?.overview ?? `${project.customerName}様向け ${project.title} 工事仕様書`,
        workSummary: input?.workSummary ?? "",
        notes: input?.notes ?? plan.notes,
    };
    const { pdfPath } = generateSpecificationPdf(project, plan, docBase);
    return {
        id: uuid(),
        projectId: project.id,
        drawingPlanId: plan.id,
        title,
        overview: docBase.overview,
        includedTrades: [plan.tradeType],
        materialSummary: createEstimateCandidateFromDrawingPlan(plan).summary,
        workSummary: docBase.workSummary,
        notes: docBase.notes,
        pdfPath,
        createdAt: now,
        updatedAt: now,
    };
}

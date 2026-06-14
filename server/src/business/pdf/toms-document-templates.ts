/**
 * TOMS 帳票テンプレート定義 — HTML/CSS 実装 + 将来 xlsx 差し替え用
 *
 * 現在: PWA → HTML/CSS → Puppeteer PDF
 * 将来: engine を "xlsx" に切替して Excel テンプレートから PDF 生成可能
 */
import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";
import type { PracticalCompletionReportContext } from "../../estimate/practical-completion-report-template.js";
import type { SpecificationContext } from "../../estimate/specification-template.js";
import { renderCompletionReportHtml } from "./completion-report-template.js";
import { renderEstimateHtmlV2, type EstimateHtmlOptions } from "./estimate-template-v2.js";
import { renderInvoiceHtmlV2, type InvoiceHtmlOptions } from "./invoice-template-v2.js";
import { renderPracticalCompletionReportHtml } from "../../estimate/practical-completion-report-template.js";
import { renderSpecificationHtml } from "../../estimate/specification-template.js";

export type TomsDocumentTemplateId =
  | "estimate-template"
  | "estimate-template-v2"
  | "invoice-template"
  | "invoice-template-v2"
  | "specification-template"
  | "completion-report-template";

export type TomsTemplateEngine = "html-css" | "xlsx";

export interface TomsDocumentTemplateMeta {
  id: TomsDocumentTemplateId;
  label: string;
  engine: TomsTemplateEngine;
  /** 将来 Excel テンプレート差し替え用（未実装） */
  excelTemplateFile?: string;
  htmlModule: string;
}

export const TOMS_DOCUMENT_TEMPLATES: Record<TomsDocumentTemplateId, TomsDocumentTemplateMeta> = {
  "estimate-template": {
    id: "estimate-template",
    label: "見積書",
    engine: "html-css",
    excelTemplateFile: "TOMS_見積もり書_フォーマット.xlsx",
    htmlModule: "./estimate-template-v2.js",
  },
  "estimate-template-v2": {
    id: "estimate-template-v2",
    label: "見積書 v2",
    engine: "html-css",
    excelTemplateFile: "TOMS_見積もり書_フォーマット.xlsx",
    htmlModule: "./estimate-template-v2.js",
  },
  "invoice-template": {
    id: "invoice-template",
    label: "請求書",
    engine: "html-css",
    excelTemplateFile: "TOMS_請求書_フォーマット.xlsx",
    htmlModule: "./invoice-template-v2.js",
  },
  "invoice-template-v2": {
    id: "invoice-template-v2",
    label: "請求書 v2",
    engine: "html-css",
    excelTemplateFile: "TOMS_請求書_フォーマット.xlsx",
    htmlModule: "./invoice-template-v2.js",
  },
  "specification-template": {
    id: "specification-template",
    label: "仕様書",
    engine: "html-css",
    htmlModule: "../../estimate/specification-template.js",
  },
  "completion-report-template": {
    id: "completion-report-template",
    label: "完了報告書",
    engine: "html-css",
    htmlModule: "../../estimate/practical-completion-report-template.js",
  },
};

export function getTomsDocumentTemplate(id: TomsDocumentTemplateId): TomsDocumentTemplateMeta {
  return TOMS_DOCUMENT_TEMPLATES[id];
}

export function listTomsDocumentTemplates(): TomsDocumentTemplateMeta[] {
  return Object.values(TOMS_DOCUMENT_TEMPLATES);
}

/** HTML/CSS テンプレ — 見積書（v2 Excel帳票風） */
export function renderTomsEstimateTemplateHtml(
  project: BusinessProject,
  estimate: Estimate,
  opts?: EstimateHtmlOptions
): string {
  return renderEstimateHtmlV2(project, estimate, opts);
}

/** HTML/CSS テンプレ — 請求書（v2 Excel帳票風） */
export function renderTomsInvoiceTemplateHtml(
  project: BusinessProject,
  invoice: Invoice,
  estimate: Estimate,
  opts?: InvoiceHtmlOptions
): string {
  return renderInvoiceHtmlV2(project, invoice, estimate, opts);
}

/** HTML/CSS テンプレ — 仕様書（実務 PWA） */
export function renderTomsSpecificationTemplateHtml(ctx: SpecificationContext): string {
  return renderSpecificationHtml(ctx);
}

/** HTML/CSS テンプレ — 完了報告書（実務 PWA） */
export function renderTomsCompletionReportTemplateHtml(ctx: PracticalCompletionReportContext): string {
  return renderPracticalCompletionReportHtml(ctx);
}

/** HTML/CSS テンプレ — 完了報告書（business モジュール・レガシー） */
export function renderTomsBusinessCompletionReportTemplateHtml(
  project: BusinessProject,
  report: CompletionReport
): string {
  return renderCompletionReportHtml(project, report);
}

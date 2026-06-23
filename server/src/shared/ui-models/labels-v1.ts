/**
 * 画面表示文言 — React Native 流用前提の単一ソース
 */

export const TISLY_UI_LABELS_V1 = {
  customerPortalTitle: "TiSLY お客様ページ",
  customerPortalSubtitle: "システムの状態と資料をご確認いただけます",
  propertyName: "物件名",
  workDescription: "工事内容",
  sitePhotos: "現場写真",
  specificationPdf: "仕様書",
  completionReportPdf: "完了報告書",
  customerExplanation: "お客様向け説明",
  monitoringLink: "セキュリティ・監視",
  contact: "連絡先",
  viewDocuments: "資料を見る",
  back: "戻る",
  preparing: "資料を準備中です",
  pdfGenerate: "PDFにする",
  pdfSave: "保存",
  companyName: "株式会社TOMS",
  accountHolder: "トムズ",
} as const;

export type TislyUiLabelKeyV1 = keyof typeof TISLY_UI_LABELS_V1;

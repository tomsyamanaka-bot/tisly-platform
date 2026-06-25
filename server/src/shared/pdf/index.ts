/** PDF データ構造 — HTML テンプレート非依存の型・共通部品 re-export */
export type { TomsV2LineItem, TomsV2TotalsInput, TomsV2DocKind } from "../../business/pdf/toms-excel-doc-layout-v2.js";
export { getTomsCompanyInfo } from "../../business/pdf/company.js";
export {
  PDF_A4_WIDTH_MM,
  PDF_A4_HEIGHT_MM,
  PDF_PHOTO_COLS,
  PDF_PHOTO_ROWS,
  PDF_PHOTOS_PER_PAGE,
  PDF_PRACTICAL_PAGE_MARGIN_MM,
  PDF_TOMS_V2_PAGE_MARGIN_MM,
  buildPdfPhotoGridStyles,
  chunkPdfArray,
  countPdfPhotoLayoutPages,
  formatPdfFooterDateTime,
  renderPdfCoverHeader,
  renderPdfCompanyDetailBlock,
  renderPdfPageNumberFooter,
  renderPdfSealImg,
  renderPdfStandardPageFooter,
  resolveCoverPhotoCapacity,
  resolvePdfSealUrl,
  slicePdfPhotosForPages,
  wrapPdfHtmlDocument,
} from "../../business/pdf/pdf-base-template.js";

export interface PdfDocumentMetaV1 {
  kind: "estimate" | "invoice" | "specification" | "completion";
  issueDate?: string;
  docNo?: string;
  addressee?: string;
  subject?: string;
  total?: number;
}

export interface PdfGenerationPayloadV1 {
  meta: PdfDocumentMetaV1;
  lines?: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  notes?: string;
  bankInfo?: string;
  includePhotos?: boolean;
}

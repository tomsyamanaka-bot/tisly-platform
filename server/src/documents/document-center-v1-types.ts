/** TiSLY Document Center v1 — 型・色分け定義 */

export type DocumentCenterTypeV1 =
  | "estimate"
  | "invoice"
  | "report"
  | "specification"
  | "survey"
  | "drawing"
  | "photo"
  | "other";

export type DocumentSourceTypeV1 = "manual" | "pdf" | "drawing" | "photo" | "voice" | "phone" | "ai";

export const SOURCE_TYPE_PRESENTATION: Record<DocumentSourceTypeV1, { label: string; icon: string }> = {
  manual: { label: "手動", icon: "✋" },
  pdf: { label: "PDF生成", icon: "📄" },
  drawing: { label: "図面", icon: "📐" },
  photo: { label: "写真", icon: "📷" },
  voice: { label: "音声", icon: "🎤" },
  phone: { label: "電話", icon: "📞" },
  ai: { label: "AI", icon: "🤖" },
};

export type DocumentWorkflowStatusV1 =
  | "draft"
  | "ready"
  | "sent"
  | "signed"
  | "completed"
  | "archived";

export interface DocumentTypePresentationV1 {
  label: string;
  folderLabel: string;
  color: string;
  bg: string;
  icon: string;
}

export const DOCUMENT_TYPE_PRESENTATION: Record<DocumentCenterTypeV1, DocumentTypePresentationV1> = {
  estimate: { label: "見積", folderLabel: "見積", color: "#2563eb", bg: "#dbeafe", icon: "📄" },
  invoice: { label: "請求", folderLabel: "請求", color: "#16a34a", bg: "#dcfce7", icon: "💴" },
  report: { label: "完了報告", folderLabel: "完了報告", color: "#ea580c", bg: "#ffedd5", icon: "✅" },
  specification: { label: "仕様書", folderLabel: "仕様書", color: "#9333ea", bg: "#f3e8ff", icon: "📋" },
  survey: { label: "現調", folderLabel: "現調", color: "#64748b", bg: "#f1f5f9", icon: "🔍" },
  drawing: { label: "図面", folderLabel: "図面", color: "#dc2626", bg: "#fee2e2", icon: "📐" },
  photo: { label: "写真", folderLabel: "写真", color: "#0891b2", bg: "#cffafe", icon: "📷" },
  other: { label: "その他", folderLabel: "その他", color: "#64748b", bg: "#f1f5f9", icon: "📎" },
};

/** Document Center フォルダ表示順 */
export const DOCUMENT_CENTER_FOLDER_ORDER: DocumentCenterTypeV1[] = [
  "estimate",
  "invoice",
  "report",
  "specification",
  "drawing",
  "photo",
  "survey",
  "other",
];

export type DocumentPreviewKindV1 = "pdf" | "image" | "json" | "none";

export interface DocumentCenterItemV1 {
  id: string;
  projectId: string;
  projectNo: string;
  customerName: string;
  siteName: string;
  documentType: DocumentCenterTypeV1;
  sourceType: DocumentSourceTypeV1;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  previewKind: DocumentPreviewKindV1;
  previewUrl: string | null;
  viewerUrl: string | null;
  localPath: string | null;
  storageDocumentId: string | null;
  qnapStatus: string | null;
  qnapStatusLabel: string | null;
  qnapStatusIcon: string | null;
  estimateNo: string | null;
  invoiceNo: string | null;
  workflowStatus: DocumentWorkflowStatusV1 | null;
  workflowStatusLabel: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentCenterFolderV1 {
  folderType: DocumentCenterTypeV1;
  label: string;
  icon: string;
  color: string;
  bg: string;
  count: number;
  items: DocumentCenterItemV1[];
}

export interface DocumentCenterProjectSummaryV1 {
  projectId: string;
  projectNo: string;
  customerName: string;
  siteName: string;
  assignee: string;
  favorite: boolean;
  documentCount: number;
  folderCounts: Partial<Record<DocumentCenterTypeV1, number>>;
  updatedAt: string;
}

export interface DocumentCenterProjectDetailV1 {
  projectId: string;
  projectNo: string;
  customerName: string;
  siteName: string;
  assignee: string;
  favorite: boolean;
  qnapConfigured: boolean;
  folders: DocumentCenterFolderV1[];
  timeline: DocumentCenterTimelineEntryV1[];
  totalDocuments: number;
}

export interface DocumentCenterTimelineEntryV1 {
  id: string;
  date: string;
  dateLabel: string;
  title: string;
  description: string;
  documentType: DocumentCenterTypeV1 | "general";
  category: string;
}

export interface DocumentCenterSearchHitV1 {
  projectId: string;
  projectNo: string;
  customerName: string;
  siteName: string;
  documentId: string;
  documentType: DocumentCenterTypeV1;
  sourceType: DocumentSourceTypeV1;
  title: string;
  fileName: string;
  estimateNo: string | null;
  invoiceNo: string | null;
  previewUrl: string | null;
  qnapStatus: string | null;
  qnapStatusLabel: string | null;
  qnapStatusIcon: string | null;
  workflowStatus: DocumentWorkflowStatusV1 | null;
  workflowStatusLabel: string | null;
  matchedField: string;
  createdAt: string;
  accessedAt?: string | null;
}

export interface DocumentCenterSearchOptionsV1 {
  query?: string;
  documentType?: DocumentCenterTypeV1 | "all";
  qnapStatus?: "pending" | "synced" | "failed" | "syncing" | "all";
  sourceType?: DocumentSourceTypeV1 | "all";
  sort?: "recent" | "created";
  username?: string;
  limit?: number;
}

export interface DrawingPreviewSummaryV1 {
  layerCount: number;
  symbolCount: number;
  wireCount: number;
  title?: string;
}

export interface DocumentCenterRecentItemV1 {
  id: string;
  projectId: string;
  projectNo: string;
  customerName: string;
  documentId: string;
  documentType: DocumentCenterTypeV1;
  title: string;
  fileName: string;
  previewUrl: string | null;
  accessedAt: string;
}

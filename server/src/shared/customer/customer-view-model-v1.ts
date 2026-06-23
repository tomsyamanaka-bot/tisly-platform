/**
 * お客様ポータル表示用データ構造 — API レスポンス専用（内部情報非含有）
 */

export interface CustomerSitePhotoV1 {
  photoId: string;
  title: string;
  previewUrl: string;
  capturedAt?: string;
}

export interface CustomerDocumentLinkV1 {
  fileId: string;
  label: string;
  kind: "specification" | "completion" | "manual" | "other";
  openUrl: string;
}

export interface CustomerContactV1 {
  companyName: string;
  phone?: string;
  email?: string;
  staffName?: string;
}

export interface CustomerProjectViewV1 {
  shareId: string;
  customerCode?: string;
  propertyName: string;
  workDescription: string;
  statusLabel: string;
  sitePhotos: CustomerSitePhotoV1[];
  documents: CustomerDocumentLinkV1[];
  customerExplanation?: string;
  monitoringUrl?: string;
  contact: CustomerContactV1;
  projectPageUrl: string;
  documentCenterUrl: string;
}

export interface CustomerHomeViewV1 {
  customerCode: string;
  customerName: string;
  projects: Array<{
    shareId: string;
    propertyName: string;
    workDescription: string;
    statusLabel: string;
    projectPageUrl: string;
  }>;
  contact: CustomerContactV1;
}

export interface CustomerPortalLandingV1 {
  title: string;
  subtitle: string;
  demoProjects: Array<{
    shareId: string;
    propertyName: string;
    projectPageUrl: string;
  }>;
}

/**
 * お客様ポータル表示用データ構造 — API レスポンス専用（内部情報非含有）
 */

import type { CustomerContactActionV1 } from "./customer-contact-settings-v1.js";

export interface CustomerSitePhotoV1 {
  photoId: string;
  title: string;
  previewUrl: string;
  capturedAt?: string;
}

export interface CustomerDocumentLinkV1 {
  fileId: string;
  label: string;
  kind: "specification" | "completion" | "estimate" | "invoice" | "manual" | "inspection" | "other";
  openUrl: string;
}

export interface CustomerContactV1 {
  companyName: string;
  phone?: string;
  email?: string;
  staffName?: string;
}

export interface CustomerHomeCardV1 {
  id: string;
  emoji: string;
  label: string;
  href: string;
}

export interface CustomerHomeViewV1 {
  title: string;
  subtitle: string;
  shareId: string;
  propertyName: string;
  systemStatus: string;
  systemStatusLabel: string;
  systemStatusEmoji: string;
  systemStatusShort: string;
  lastCheckedAt: string;
  lastCheckedLabel: string;
  currentStatusLabel: string;
  cards: CustomerHomeCardV1[];
  projectPageUrl: string;
  documentsPageUrl: string;
  monitoringPageUrl: string;
  contactPhone: string;
  contactCompany: string;
  notifications?: Array<{
    id: string;
    kind: string;
    severity: string;
    title: string;
    body: string;
    href?: string;
    createdAt: string;
  }>;
}

export interface CustomerMonitoringSensorV1 {
  sensorId: string;
  sensorName: string;
  status: string;
  statusKey: string;
  areaName: string;
  isCamera: boolean;
}

export interface CustomerMonitoringFloorV1 {
  floorId: string;
  floorName: string;
  sensors: CustomerMonitoringSensorV1[];
}

export interface CustomerMonitoringAlertV1 {
  floorId: string;
  floorName: string;
  areaName: string;
  sensorName: string;
  message: string;
  subMessage: string;
  timestamp: string;
  highlightSensorId: string;
}

export interface CustomerMonitoringLogV1 {
  id: string;
  time: string;
  place: string;
  what: string;
  isAlert: boolean;
}

export interface CustomerMonitoringViewV1 {
  shareId: string;
  propertyName: string;
  systemStatus: string;
  systemStatusLabel: string;
  systemStatusEmoji: string;
  lastCheckedAt: string;
  lastCheckedIso: string;
  floors: CustomerMonitoringFloorV1[];
  activeAlert: CustomerMonitoringAlertV1 | null;
  alertLogs: CustomerMonitoringLogV1[];
  notificationLogs: CustomerMonitoringLogV1[];
  allLogs: CustomerMonitoringLogV1[];
  noActiveIssues: boolean;
  emptyMessage: string;
  lastDetectionLabel: string;
  sensorStatusLabel: string;
  alertHistoryLabel: string;
  notificationHistoryLabel: string;
  pageTitle: string;
  contactTelHref?: string;
  contactLabel?: string;
  contactActions?: CustomerContactActionV1[];
}

export interface CustomerMaintenanceItemV1 {
  label: string;
  value: string;
}

export interface CustomerProjectViewV1 {
  shareId: string;
  propertyName: string;
  workDescription: string;
  statusLabel: string;
  sitePhotos: CustomerSitePhotoV1[];
  documents: CustomerDocumentLinkV1[];
  maintenanceItems: CustomerMaintenanceItemV1[];
  customerExplanation?: string;
  monitoringUrl?: string;
  contact: CustomerContactV1;
  contactActions?: CustomerContactActionV1[];
  quickActions?: Array<{
    id: string;
    emoji: string;
    label: string;
    href: string;
  }>;
  projectPageUrl: string;
}

export interface CustomerPropertyListItemViewV1 {
  shareId: string;
  propertyName: string;
  address?: string;
  coverPhotoUrl?: string | null;
  contractPlan?: string;
  installedDate?: string | null;
  nextInspectionDate?: string | null;
  inspectionColor?: string;
  inspectionLabel?: string;
  workDescription: string;
  statusLabel: string;
  systemStatusLabel: string;
  systemStatusEmoji: string;
  lastCheckedAt: string;
  currentStatusLabel: string;
  lastCheckedLabel: string;
  projectPageUrl: string;
  homePageUrl: string;
  monitoringPageUrl: string;
  documentsPageUrl: string;
  contactTelHref: string;
  contactActions?: CustomerContactActionV1[];
  actions: Array<{
    id: string;
    emoji: string;
    label: string;
    href: string;
  }>;
}

export interface CustomerHomeListViewV1 {
  customerName: string;
  contractPlan?: string;
  notifications?: Array<{
    id: string;
    kind: string;
    severity: string;
    title: string;
    body: string;
    href?: string;
    createdAt: string;
  }>;
  projects: CustomerPropertyListItemViewV1[];
  contact: CustomerContactV1;
  contactActions?: CustomerContactActionV1[];
}

export interface CustomerPortalLandingV1 {
  home: CustomerHomeViewV1;
  demoProjects: Array<{
    shareId: string;
    propertyName: string;
    projectPageUrl: string;
    homePageUrl: string;
  }>;
}

export interface CustomerDocumentViewV1 {
  shareId: string;
  propertyName: string;
  fileId: string;
  label: string;
  previewUrl?: string;
  pdfUrl?: string;
  backUrl: string;
}

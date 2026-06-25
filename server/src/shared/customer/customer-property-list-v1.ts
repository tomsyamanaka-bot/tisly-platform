/**
 * お客様物件一覧カード — DOM 非依存（React Native 流用）
 */

import {
  buildCustomerMonitoringUrlV1,
  buildCustomerProjectUrlV1,
} from "../routes/tisly-routes-v1.js";
import type { CustomerContactActionV1 } from "./customer-contact-settings-v1.js";
import type { CustomerContactV1 } from "./customer-view-model-v1.js";
import {
  CUSTOMER_CONTACT_LABEL_V1,
  CUSTOMER_HOME_LABELS_V1,
  CUSTOMER_PROPERTY_TAP_HINT_V1,
  CUSTOMER_SYSTEM_STATUS_V1,
  formatCustomerLastCheckedV1,
  type CustomerSystemStatusKeyV1,
} from "./customer-labels-v1.js";

export { CUSTOMER_PROPERTY_TAP_HINT_V1 };

export const CUSTOMER_PROPERTY_ACTIONS_V1 = [
  { id: "documents", emoji: "📄", label: "書類を見る" },
  { id: "monitoring", emoji: "👁", label: "見守りを見る" },
  { id: "contact", emoji: "📞", label: CUSTOMER_CONTACT_LABEL_V1 },
] as const;

export type CustomerPropertyActionIdV1 = (typeof CUSTOMER_PROPERTY_ACTIONS_V1)[number]["id"];

export interface CustomerPropertyListItemV1 {
  shareId: string;
  propertyName: string;
  address: string;
  coverPhotoUrl: string | null;
  contractPlan: string;
  installedDate: string | null;
  nextInspectionDate: string | null;
  inspectionColor: string;
  inspectionLabel: string;
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
    id: CustomerPropertyActionIdV1;
    emoji: string;
    label: string;
    href: string;
  }>;
}

export function buildCustomerPropertyListItemV1(
  project: {
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
    projectPageUrl: string;
    homePageUrl: string;
    systemStatusKey?: CustomerSystemStatusKeyV1;
    lastCheckedIso?: string | null;
  },
  contact: CustomerContactV1,
  contactActions?: CustomerContactActionV1[]
): CustomerPropertyListItemV1 {
  const phone = String(contact.phone ?? "").replace(/[^\d+]/g, "");
  const telHref = phone ? `tel:${phone}` : "";

  const projectPageUrl = project.projectPageUrl || buildCustomerProjectUrlV1(project.shareId);
  const monitoringPageUrl = buildCustomerMonitoringUrlV1(project.shareId);
  const documentsPageUrl = `${projectPageUrl}#documents`;
  const contactPageUrl = `${projectPageUrl}#contact`;

  const primaryContactHref =
    contactActions?.find((a) => a.id === "phone")?.href ||
    telHref ||
    contactActions?.[0]?.href ||
    contactPageUrl;

  const actionHrefs: Record<CustomerPropertyActionIdV1, string> = {
    documents: documentsPageUrl,
    monitoring: monitoringPageUrl,
    contact: primaryContactHref,
  };

  const systemKey = project.systemStatusKey ?? "normal";
  const system = CUSTOMER_SYSTEM_STATUS_V1[systemKey];

  return {
    ...project,
    address: project.address ?? "",
    coverPhotoUrl: project.coverPhotoUrl ?? null,
    contractPlan: project.contractPlan ?? "Standard",
    installedDate: project.installedDate ?? null,
    nextInspectionDate: project.nextInspectionDate ?? null,
    inspectionColor: project.inspectionColor ?? "gray",
    inspectionLabel: project.inspectionLabel ?? "",
    systemStatusLabel: system.label,
    systemStatusEmoji: system.emoji,
    lastCheckedAt: formatCustomerLastCheckedV1(project.lastCheckedIso),
    currentStatusLabel: CUSTOMER_HOME_LABELS_V1.currentStatus,
    lastCheckedLabel: CUSTOMER_HOME_LABELS_V1.lastChecked,
    projectPageUrl,
    monitoringPageUrl,
    documentsPageUrl,
    contactTelHref: telHref,
    contactActions: contactActions ?? [],
    actions: CUSTOMER_PROPERTY_ACTIONS_V1.map((a) => ({
      id: a.id,
      emoji: a.emoji,
      label: a.label,
      href: actionHrefs[a.id],
    })),
  };
}

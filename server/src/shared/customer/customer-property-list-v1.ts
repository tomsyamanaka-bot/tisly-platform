/**
 * お客様物件一覧カード — DOM 非依存（React Native 流用）
 */

import {
  buildCustomerMonitoringUrlV1,
  buildCustomerProjectUrlV1,
} from "../routes/tisly-routes-v1.js";
import type { CustomerContactV1 } from "./customer-view-model-v1.js";

export const CUSTOMER_PROPERTY_ACTIONS_V1 = [
  { id: "documents", emoji: "📄", label: "書類を見る" },
  { id: "monitoring", emoji: "👁", label: "見守りを見る" },
  { id: "contact", emoji: "📞", label: "連絡する" },
] as const;

export type CustomerPropertyActionIdV1 = (typeof CUSTOMER_PROPERTY_ACTIONS_V1)[number]["id"];

export interface CustomerPropertyListItemV1 {
  shareId: string;
  propertyName: string;
  workDescription: string;
  statusLabel: string;
  projectPageUrl: string;
  homePageUrl: string;
  monitoringPageUrl: string;
  documentsPageUrl: string;
  contactTelHref: string;
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
    workDescription: string;
    statusLabel: string;
    projectPageUrl: string;
    homePageUrl: string;
  },
  contact: CustomerContactV1
): CustomerPropertyListItemV1 {
  const phone = String(contact.phone ?? "").replace(/[^\d+]/g, "");
  const telHref = phone ? `tel:${phone}` : "";

  const projectPageUrl = project.projectPageUrl || buildCustomerProjectUrlV1(project.shareId);
  const monitoringPageUrl = buildCustomerMonitoringUrlV1(project.shareId);
  const documentsPageUrl = `${projectPageUrl}#documents`;

  const actionHrefs: Record<CustomerPropertyActionIdV1, string> = {
    documents: documentsPageUrl,
    monitoring: monitoringPageUrl,
    contact: telHref || projectPageUrl,
  };

  return {
    ...project,
    projectPageUrl,
    monitoringPageUrl,
    documentsPageUrl,
    contactTelHref: telHref,
    actions: CUSTOMER_PROPERTY_ACTIONS_V1.map((a) => ({
      id: a.id,
      emoji: a.emoji,
      label: a.label,
      href: actionHrefs[a.id],
    })),
  };
}

/**
 * お客様資料ページ・監視画面のアクション定義 — DOM 非依存（React Native 流用）
 */

import {
  buildCustomerMonitoringUrlV1,
  buildCustomerProjectUrlV1,
} from "../routes/tisly-routes-v1.js";
import type { CustomerContactV1 } from "./customer-view-model-v1.js";
import { CUSTOMER_CONTACT_LABEL_V1 } from "./customer-labels-v1.js";

export const CUSTOMER_PROJECT_PHOTOS_LABEL_V1 = "工事写真";

export const CUSTOMER_PROJECT_QUICK_ACTIONS_V1 = [
  { id: "documents", emoji: "📄", label: "書類を見る", target: "documents" as const },
  { id: "monitoring", emoji: "👁", label: "見守りを見る", target: "monitoring" as const },
  { id: "contact", emoji: "📞", label: CUSTOMER_CONTACT_LABEL_V1, target: "contact" as const },
] as const;

export type CustomerProjectQuickActionIdV1 =
  (typeof CUSTOMER_PROJECT_QUICK_ACTIONS_V1)[number]["id"];

export interface CustomerProjectQuickActionV1 {
  id: CustomerProjectQuickActionIdV1;
  emoji: string;
  label: string;
  href: string;
}

export function buildCustomerContactTelHrefV1(contact: CustomerContactV1): string {
  const phone = String(contact.phone ?? "").replace(/[^\d+]/g, "");
  return phone ? `tel:${phone}` : "";
}

export function buildCustomerProjectQuickActionsV1(
  shareId: string,
  contact: CustomerContactV1
): CustomerProjectQuickActionV1[] {
  const projectUrl = buildCustomerProjectUrlV1(shareId);
  const monitoringUrl = buildCustomerMonitoringUrlV1(shareId);
  const telHref = buildCustomerContactTelHrefV1(contact);

  const hrefs: Record<CustomerProjectQuickActionIdV1, string> = {
    documents: `${projectUrl}#documents`,
    monitoring: monitoringUrl,
    contact: telHref || projectUrl,
  };

  return CUSTOMER_PROJECT_QUICK_ACTIONS_V1.map((a) => ({
    id: a.id,
    emoji: a.emoji,
    label: a.label,
    href: hrefs[a.id],
  }));
}

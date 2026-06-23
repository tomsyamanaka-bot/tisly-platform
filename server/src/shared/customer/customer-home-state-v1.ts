/**
 * お客様ホーム画面状態 — DOM 非依存
 */

import {
  buildCustomerDocumentUrlV1,
  buildCustomerMonitoringUrlV1,
  buildCustomerProjectUrlV1,
} from "../routes/tisly-routes-v1.js";
import {
  CUSTOMER_HOME_CARDS_V1,
  CUSTOMER_HOME_LABELS_V1,
  CUSTOMER_PAGE_TITLE_V1,
  CUSTOMER_SYSTEM_STATUS_V1,
  formatCustomerLastCheckedV1,
  type CustomerSystemStatusKeyV1,
} from "./customer-labels-v1.js";
import { buildCustomerMonitoringDetailV1 } from "./customer-monitoring-state-v1.js";
import type { CustomerHomeCardV1, CustomerHomeViewV1 } from "./customer-view-model-v1.js";
import { decodeCustomerShareIdV1 } from "./customer-share-id-v1.js";

function buildCardUrl(
  shareId: string,
  card: (typeof CUSTOMER_HOME_CARDS_V1)[number]
): string {
  if ("view" in card && card.view) {
    return `${buildCustomerMonitoringUrlV1(shareId)}?view=${card.view}`;
  }
  const projectUrl = buildCustomerProjectUrlV1(shareId);
  if ("section" in card) {
    if (card.section === "documents") return `${projectUrl}#documents`;
    if (card.section === "maintenance") return `${projectUrl}#maintenance`;
    if (card.section === "contact") return `${projectUrl}#contact`;
  }
  return projectUrl;
}

export function buildCustomerHomeStateV1(opts: {
  shareId: string;
  propertyName: string;
  ref?: string;
}): CustomerHomeViewV1 {
  const ref = opts.ref ?? decodeCustomerShareIdV1(opts.shareId);
  const monitoring = buildCustomerMonitoringDetailV1(opts.shareId, opts.propertyName, ref);
  const systemKey = monitoring.systemStatus as CustomerSystemStatusKeyV1;
  const system = CUSTOMER_SYSTEM_STATUS_V1[systemKey];

  const cards: CustomerHomeCardV1[] = CUSTOMER_HOME_CARDS_V1.map((c) => ({
    id: c.id,
    emoji: c.emoji,
    label: c.label,
    href: buildCardUrl(opts.shareId, c),
  }));

  return {
    title: CUSTOMER_PAGE_TITLE_V1,
    subtitle: opts.propertyName,
    shareId: opts.shareId,
    propertyName: opts.propertyName,
    systemStatus: systemKey,
    systemStatusLabel: system.label,
    systemStatusEmoji: system.emoji,
    systemStatusShort: system.short,
    lastCheckedAt: monitoring.lastCheckedAt,
    lastCheckedLabel: CUSTOMER_HOME_LABELS_V1.lastChecked,
    currentStatusLabel: CUSTOMER_HOME_LABELS_V1.currentStatus,
    cards,
    projectPageUrl: buildCustomerProjectUrlV1(opts.shareId),
    documentsPageUrl: buildCustomerDocumentUrlV1(opts.shareId),
    monitoringPageUrl: buildCustomerMonitoringUrlV1(opts.shareId),
    contactPhone: "048-000-0000",
    contactCompany: "株式会社TOMS",
  };
}

export function buildDefaultCustomerHomeV1(): CustomerHomeViewV1 {
  return buildCustomerHomeStateV1({
    shareId: "",
    propertyName: "お客様の物件",
    ref: "DEMO-HOME-001",
  });
}

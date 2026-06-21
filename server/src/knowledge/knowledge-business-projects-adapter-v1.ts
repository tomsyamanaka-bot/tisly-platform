/** Knowledge Customer UI V4 — PWA business_projects → Customer Project adapter */

import { listBusinessProjects, getBusinessProject } from "../business/business-store.js";
import type { BusinessProject, BusinessProjectStatus } from "../business/business-types.js";
import { normalizeProjectStatus } from "../business/business-status.js";
import { detectCityCodeFromText } from "../projects/project-id-v1.js";
import {
  getCityNameFromCodeV1,
  isProductionProjectRefV1,
  normalizeCustomerProjectRefV1,
  type KnowledgeCustomerProjectMetaV1,
  type KnowledgeCustomerProjectKnowledgeRefV1,
} from "./knowledge-customer-project-adapter-v1.js";
import { listCustomerProjectFilesV1 } from "./knowledge-customer-project-files-v1.js";

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  new: "準備中",
  survey_scheduled: "現調予定",
  survey_done: "現調完了",
  estimate_created: "見積準備中",
  estimate_sent: "見積提示",
  construction_scheduled: "施工予定",
  construction_done: "施工完了",
  completion_report_created: "完了報告準備中",
  invoice_created: "請求準備中",
  invoice_sent: "請求済",
  partial_paid: "入金確認中",
  paid: "完了",
  closed: "完了",
};

const WORK_GENRE_KEYWORDS: Array<{ keywords: RegExp; workType: string; templateKey: string }> = [
  { keywords: /防犯|カメラ|セキュリティ|監視/, workType: "戸建て防犯設備", templateKey: "DEMO-HOME-001" },
  { keywords: /工場|PLC|ライン|制御盤|生産/, workType: "工場設備", templateKey: "DEMO-FACTORY-001" },
  { keywords: /LAN|Wi-?Fi|ネットワーク|通信|AP/, workType: "ネットワーク改善", templateKey: "DEMO-NETWORK-001" },
  { keywords: /電気|照明|分電|コンセント|配線/, workType: "電気設備工事", templateKey: "DEMO-HOME-001" },
];

function inferWorkProfile(text: string): { workType: string; templateKey: string; genreTag: string } {
  for (const entry of WORK_GENRE_KEYWORDS) {
    if (entry.keywords.test(text)) {
      const genreTag = entry.workType.includes("防犯")
        ? "防犯"
        : entry.workType.includes("工場")
          ? "工場"
          : entry.workType.includes("ネットワーク")
            ? "ネットワーク"
            : "電気";
      return { workType: entry.workType, templateKey: entry.templateKey, genreTag };
    }
  }
  return { workType: "設備工事", templateKey: "DEMO-HOME-001", genreTag: "電気" };
}

function resolveCity(project: BusinessProject): string {
  const municipality = project.municipality?.trim();
  if (municipality) return municipality;
  const fromAddress = project.address?.trim();
  if (fromAddress) {
    const code = detectCityCodeFromText(fromAddress);
    return getCityNameFromCodeV1(code);
  }
  return "現場";
}

function buildCustomerSafeTitle(city: string, workType: string): string {
  return `${city} ${workType.replace(/様邸.*$/u, "").trim()}`;
}

function buildCustomerSafeDisplayName(city: string, workType: string): string {
  return buildCustomerSafeTitle(city, workType);
}

function mapStatusLabel(status: BusinessProjectStatus | string): string {
  const normalized = normalizeProjectStatus(String(status));
  return CUSTOMER_STATUS_LABELS[normalized] ?? "進行中";
}

function inferAreas(workType: string): string[] {
  if (workType.includes("工場")) return ["工場ライン", "制御盤", "分電盤"];
  if (workType.includes("ネットワーク")) return ["通信ラック", "事務所"];
  return ["玄関", "外周", "分電盤", "駐車場"];
}

function defaultKnowledgeRefs(workType: string): KnowledgeCustomerProjectKnowledgeRefV1[] {
  if (workType.includes("工場")) {
    return [{ id: "PLC-SELF-HOLD-001", kind: "plc" }];
  }
  if (workType.includes("ネットワーク")) {
    return [{ id: "RP-ESP32-001", kind: "knowledge_card" }];
  }
  return [{ id: "RP-RP2350-001", kind: "knowledge_card" }];
}

function resolveStorageRef(project: BusinessProject): string {
  return project.projectNo || project.id;
}

export function isBusinessProjectsTableAvailableV1(): boolean {
  try {
    listBusinessProjects();
    return true;
  } catch {
    return false;
  }
}

export function findBusinessProjectByRefV1(ref: string): BusinessProject | null {
  if (!isBusinessProjectsTableAvailableV1()) return null;
  const normalized = normalizeCustomerProjectRefV1(ref);
  const upper = normalized.toUpperCase();

  const byId = getBusinessProject(normalized);
  if (byId) return byId;

  for (const project of listBusinessProjects()) {
    if (project.projectNo === normalized || project.projectNo.toUpperCase() === upper) {
      return project;
    }
    if (project.id === normalized || project.id.toUpperCase() === upper) {
      return project;
    }
    if (project.projectNo.startsWith(`${normalized}-`) || project.projectNo.startsWith(`${upper}-`)) {
      return project;
    }
  }
  return null;
}

export function convertBusinessProjectToCustomerMetaV1(
  project: BusinessProject
): KnowledgeCustomerProjectMetaV1 {
  const profileText = `${project.title} ${project.constructionMemo} ${project.surveyMemo} ${project.requiredMaterials}`;
  const profile = inferWorkProfile(profileText);
  const city = resolveCity(project);
  const workType = profile.workType;
  const ref = project.projectNo || project.id;
  const visitDate = project.surveySchedule?.date?.trim() || "";
  const storageRef = resolveStorageRef(project);

  return {
    ref,
    displayName: buildCustomerSafeDisplayName(city, workType),
    city,
    customerSafeTitle: buildCustomerSafeTitle(city, workType),
    workType,
    workSummary: project.title?.trim() || `${city}での${workType}`,
    propertyType: workType.includes("工場") ? "工場" : workType.includes("ネットワーク") ? "オフィス" : "—",
    visitDate,
    status: mapStatusLabel(project.status),
    areas: inferAreas(workType),
    relatedKnowledgeIds: defaultKnowledgeRefs(workType),
    relatedPhotoIds: [],
    relatedPdfIds: [],
    customerNotes: `${city}の${workType}に関する資料をご確認いただけます。`,
    templateKey: profile.templateKey,
    storageRef,
    isFallback: false,
  };
}

export function tryResolveCustomerMetaFromBusinessProjectsV1(
  ref: string
): KnowledgeCustomerProjectMetaV1 | null {
  const project = findBusinessProjectByRefV1(ref);
  if (!project) return null;
  return convertBusinessProjectToCustomerMetaV1(project);
}

export interface KnowledgeCustomerProjectListItemV1 {
  ref: string;
  propertyName: string;
  city: string;
  workGenre: string;
  genreTag: string;
  status: string;
  statusFilter: "preparing" | "active" | "completed";
  visitDate: string;
  hasPhotos: boolean;
  hasPdfs: boolean;
  hasSiteMap: boolean;
  icon: string;
  pageUrl: string;
  siteMapUrl: string;
  shareUrl: string;
  updatedAt: string;
}

function statusFilterBucket(status: string): KnowledgeCustomerProjectListItemV1["statusFilter"] {
  if (/完了|入金|請求済/.test(status)) return "completed";
  if (/準備中|予定|作成中/.test(status)) return "preparing";
  return "active";
}

function genreIcon(workType: string): string {
  if (workType.includes("工場")) return "🏭";
  if (workType.includes("ネットワーク")) return "📶";
  if (workType.includes("防犯")) return "🏡";
  return "⚡";
}

export function listCustomerProjectsFromBusinessDbV1(): KnowledgeCustomerProjectListItemV1[] {
  if (!isBusinessProjectsTableAvailableV1()) return [];

  return listBusinessProjects().map((project) => {
    const meta = convertBusinessProjectToCustomerMetaV1(project);
    const profile = inferWorkProfile(`${project.title} ${project.surveyMemo}`);
    const ref = meta.ref;
    const files = listCustomerProjectFilesV1(ref);
    const hasPhotos = files.some((f) => f.type.includes("photo"));
    const hasPdfs = files.some((f) => f.type.includes("pdf") || f.type === "part_doc");

    return {
      ref,
      propertyName: meta.displayName,
      city: meta.city,
      workGenre: meta.workType,
      genreTag: profile.genreTag,
      status: meta.status,
      statusFilter: statusFilterBucket(meta.status),
      visitDate: meta.visitDate,
      hasPhotos,
      hasPdfs,
      hasSiteMap: meta.areas.length >= 2,
      icon: genreIcon(meta.workType),
      pageUrl: `/knowledge-customer-project-v1?ref=${encodeURIComponent(ref)}`,
      siteMapUrl: `/knowledge-customer-site-map-v1?ref=${encodeURIComponent(ref)}`,
      shareUrl: `/knowledge-customer-project-v1?ref=${encodeURIComponent(ref)}&view=share`,
      updatedAt: project.updatedAt,
    };
  });
}

export function matchesCustomerProjectListFilterV1(
  item: KnowledgeCustomerProjectListItemV1,
  filter: string
): boolean {
  const f = filter.trim().toLowerCase();
  if (!f || f === "all" || f === "すべて") return true;
  if (f === "完了" || f === "completed") return item.statusFilter === "completed";
  if (f === "準備中" || f === "preparing") return item.statusFilter === "preparing";
  if (f === "防犯") return item.genreTag === "防犯" || item.workGenre.includes("防犯");
  if (f === "電気") return item.genreTag === "電気" || item.workGenre.includes("電気");
  if (f === "工場") return item.genreTag === "工場" || item.workGenre.includes("工場");
  if (f === "ネットワーク") return item.genreTag === "ネットワーク" || item.workGenre.includes("ネットワーク");
  return (
    item.propertyName.toLowerCase().includes(f) ||
    item.city.toLowerCase().includes(f) ||
    item.workGenre.toLowerCase().includes(f) ||
    item.status.toLowerCase().includes(f)
  );
}

export function isBusinessProjectRefV1(ref: string): boolean {
  return Boolean(findBusinessProjectByRefV1(ref)) || isProductionProjectRefV1(ref);
}

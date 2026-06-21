/** Knowledge Customer UI V4 — お客様向け案件一覧 */

import { listCustomerDemoProjectsV1 } from "./knowledge-customer-project-v1.js";
import {
  listCustomerProjectsFromBusinessDbV1,
  matchesCustomerProjectListFilterV1,
  type KnowledgeCustomerProjectListItemV1,
} from "./knowledge-business-projects-adapter-v1.js";
import { resolveCustomerProjectMetaV1 } from "./knowledge-customer-project-adapter-v1.js";
import { listCustomerProjectFilesV1 } from "./knowledge-customer-project-files-v1.js";

export interface KnowledgeCustomerProjectsPageV1 {
  projects: KnowledgeCustomerProjectListItemV1[];
  total: number;
  filter: string;
  query: string;
  customerHomeV2Url: string;
  projectsPageUrl: string;
}

function demoToListItem(
  demo: ReturnType<typeof listCustomerDemoProjectsV1>[number]
): KnowledgeCustomerProjectListItemV1 {
  const meta = resolveCustomerProjectMetaV1(demo.ref);
  const files = listCustomerProjectFilesV1(demo.ref);
  const hasPhotos = files.some((f) => f.type.includes("photo"));
  const hasPdfs = files.some((f) => f.type.includes("pdf"));
  const status = meta.status || "デモ";
  const statusFilter: KnowledgeCustomerProjectListItemV1["statusFilter"] = /完了/.test(status)
    ? "completed"
    : /準備|デモ/.test(status)
      ? "preparing"
      : "active";

  let genreTag = "防犯";
  if (demo.workGenre.includes("工場")) genreTag = "工場";
  else if (demo.workGenre.includes("ネットワーク")) genreTag = "ネットワーク";
  else if (demo.workGenre.includes("電気")) genreTag = "電気";

  return {
    ref: demo.ref,
    propertyName: demo.propertyName,
    city: meta.city,
    workGenre: demo.workGenre,
    genreTag,
    status,
    statusFilter,
    visitDate: meta.visitDate,
    hasPhotos,
    hasPdfs,
    hasSiteMap: meta.areas.length >= 2,
    icon: demo.icon,
    pageUrl: demo.pageUrl,
    siteMapUrl: demo.siteMapUrl,
    shareUrl: `${demo.pageUrl}&view=share`,
    updatedAt: meta.visitDate || "2026-01-01T00:00:00.000Z",
  };
}

export function listAllCustomerProjectsV1(): KnowledgeCustomerProjectListItemV1[] {
  const fromDb = listCustomerProjectsFromBusinessDbV1();
  const seen = new Set(fromDb.map((p) => p.ref));
  const demos = listCustomerDemoProjectsV1()
    .filter((d) => !seen.has(d.ref))
    .map(demoToListItem);

  return [...fromDb, ...demos].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function buildCustomerProjectsPageV1(input?: {
  filter?: string;
  query?: string;
}): KnowledgeCustomerProjectsPageV1 {
  const filter = String(input?.filter ?? "").trim();
  const query = String(input?.query ?? "").trim().toLowerCase();

  let projects = listAllCustomerProjectsV1();

  if (query) {
    projects = projects.filter(
      (p) =>
        p.propertyName.toLowerCase().includes(query) ||
        p.city.toLowerCase().includes(query) ||
        p.workGenre.toLowerCase().includes(query) ||
        p.status.toLowerCase().includes(query)
    );
  }

  if (filter) {
    projects = projects.filter((p) => matchesCustomerProjectListFilterV1(p, filter));
  }

  return {
    projects,
    total: projects.length,
    filter: filter || "all",
    query,
    customerHomeV2Url: "/knowledge-customer-v2",
    projectsPageUrl: "/knowledge-customer-projects-v1",
  };
}

/** Knowledge Customer UI V2 — お客様向けホーム（案件一覧 + カテゴリ） */

import { buildCustomerHomeV1 } from "./knowledge-customer-home-v1.js";
import { listCustomerDemoProjectsV1 } from "./knowledge-customer-project-v1.js";

export interface KnowledgeCustomerHomeV2 {
  headline: string;
  subheadline: string;
  demoProjects: ReturnType<typeof listCustomerDemoProjectsV1>;
  categories: ReturnType<typeof buildCustomerHomeV1>["categories"];
  recentItems: ReturnType<typeof buildCustomerHomeV1>["recentItems"];
  customerV1Url: string;
}

export function buildCustomerHomeV2(): KnowledgeCustomerHomeV2 {
  const v1 = buildCustomerHomeV1();
  return {
    headline: "TiSLY Knowledge",
    subheadline: "この物件の設備と資料を、わかりやすくご確認いただけます",
    demoProjects: listCustomerDemoProjectsV1(),
    categories: v1.categories,
    recentItems: v1.recentItems.map((item) => ({
      ...item,
      detailUrl: item.detailUrl,
    })),
    customerV1Url: "/knowledge-customer-v1",
  };
}

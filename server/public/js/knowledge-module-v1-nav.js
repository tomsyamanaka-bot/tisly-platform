/** ナレッジモジュール — 認証確認後に React バンドルを読み込む */

import { requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

initPracticalNav({
  appId: "knowledge_module_v1",
  appName: "ナレッジ",
  theme: "hub",
});

const session = await requireCustomerLogin();
if (session) {
  await import("/js/features/knowledge/knowledge-module.bundle.js");
}

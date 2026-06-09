/**
 * 営業デモ起動: npm run demo
 * 仮想現場シード + 30秒毎イベント生成 + HTTP サーバー
 */
process.env.TISLY_DEMO_MODE = "true";
process.env.TISLY_DEMO_AUTO_START = "true";
await import("../index.js");
export {};

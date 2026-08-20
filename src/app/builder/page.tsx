/**
 * Next.js / React Native 流用向けスタブ。
 * 本番配信は Express: /builder → tisly_3d_floorplan_builder.html
 * このファイルはルート契約と型の単一ソースとして置く。
 */

export const FLOORPLAN_BUILDER_PATH = "/builder";
export const FLOORPLAN_BUILDER_HTML = "/tisly_3d_floorplan_builder.html";
export const FLOORPLAN_BUILDER_API = "/api/floorplan-builder/v1";

export const FLOORPLAN_BUILDER_META = {
  title: "TiSLY 3D Floorplan Builder",
  description:
    "方眼紙スキャン＆3D斜め俯瞰図（アイソメトリック）ジェネレーター",
  presets: ["tsukuba_model_house", "hiraya_demo"],
} as const;

/** App Router 互換のデフォルトエクスポート（メタのみ） */
export default function FloorplanBuilderPage() {
  if (typeof window !== "undefined") {
    window.location.replace(FLOORPLAN_BUILDER_PATH);
  }
  return null;
}

import type { DrawingSymbol, DrawingTradeType } from "./drawing-types.js";

function sym(
  tradeType: DrawingTradeType,
  symbolType: string,
  label: string,
  icon: string,
  color: string,
  memo = ""
): Omit<DrawingSymbol, "id"> {
  return { tradeType, symbolType, label, icon, color, defaultEstimateItemId: null, memo };
}

/** Phase601–620 業種別記号ライブラリ初期データ */
export const DRAWING_SYMBOL_SEED: Array<Omit<DrawingSymbol, "id">> = [
  ...[
    ["camera", "カメラ", "cam", "#2563eb"],
    ["nvr", "NVR", "nvr", "#1d4ed8"],
    ["poe_switch", "PoEスイッチ", "sw", "#3b82f6"],
    ["lan_route", "LAN配線", "lan", "#60a5fa"],
    ["waterproof_box", "防水BOX", "box", "#64748b"],
    ["monitor", "モニター", "mon", "#0ea5e9"],
  ].map(([t, l, i, c]) => sym("security_camera", t, l, i, c)),
  ...[
    ["indoor_unit", "室内機", "in", "#0d9488"],
    ["outdoor_unit", "室外機", "out", "#14b8a6"],
    ["refrigerant", "冷媒管", "ref", "#2dd4bf"],
    ["drain", "ドレン", "dr", "#5eead4"],
    ["dedicated_outlet", "専用コンセント", "out", "#f59e0b"],
    ["breaker", "ブレーカー", "br", "#d97706"],
    ["duct", "ダクト", "duct", "#94a3b8"],
  ].map(([t, l, i, c]) => sym("aircon", t, l, i, c)),
  ...[
    ["light", "照明", "lt", "#eab308"],
    ["downlight", "ダウンライト", "dl", "#ca8a04"],
    ["switch", "スイッチ", "sw", "#a16207"],
    ["outlet", "コンセント", "oc", "#facc15"],
    ["panel", "分電盤", "pn", "#854d0e"],
    ["vvf_route", "VVF配線", "vvf", "#fde047"],
    ["exposed_pipe", "露出配管", "pipe", "#78716c"],
  ].map(([t, l, i, c]) => sym("lighting", t, l, i, c)),
  ...[
    ["onu", "ONU", "onu", "#7c3aed"],
    ["router", "ルーター", "rt", "#8b5cf6"],
    ["ap", "AP", "ap", "#a78bfa"],
    ["lan_jack", "LANジャック", "jack", "#c4b5fd"],
    ["hub", "HUB", "hub", "#6d28d9"],
    ["lan_route", "LAN配線", "lan", "#ddd6fe"],
  ].map(([t, l, i, c]) => sym("internet", t, l, i, c)),
  ...[
    ["antenna", "アンテナ", "ant", "#dc2626"],
    ["booster", "ブースター", "bst", "#ef4444"],
    ["splitter", "分配器", "spl", "#f87171"],
    ["tv_terminal", "TV端子", "tv", "#fca5a5"],
    ["coax_route", "同軸ルート", "coax", "#fecaca"],
  ].map(([t, l, i, c]) => sym("tv_antenna", t, l, i, c)),
];

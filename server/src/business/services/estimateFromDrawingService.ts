import type {
  DrawingEstimateCandidate,
  DrawingEstimateCandidateLine,
  DrawingPlan,
  DrawingRouteType,
} from "../drawing-types.js";
import { listDrawingSymbols } from "../drawing-store.js";

const ROUTE_LABELS: Record<DrawingRouteType, { name: string; unit: string }> = {
  lan: { name: "LAN配線", unit: "m" },
  vvf: { name: "VVF配線", unit: "m" },
  coaxial: { name: "同軸ケーブル", unit: "m" },
  refrigerant_pipe: { name: "冷媒配管", unit: "m" },
  drain: { name: "ドレン配管", unit: "m" },
  pf_pipe: { name: "PF管", unit: "m" },
  cd_pipe: { name: "CD管", unit: "m" },
  duct: { name: "ダクト", unit: "m" },
  other: { name: "配線・配管", unit: "m" },
};

export function summarizeMaterialsFromDrawing(
  plan: DrawingPlan
): DrawingEstimateCandidateLine[] {
  const lib = listDrawingSymbols();
  const byLabel = new Map<string, DrawingEstimateCandidateLine>();

  for (const placed of plan.symbols) {
    const def = lib.find((s) => s.id === placed.symbolId);
    const label = placed.label || def?.label || "部材";
    const key = `sym:${def?.symbolType ?? label}`;
    const prev = byLabel.get(key);
    if (prev) {
      prev.quantity += 1;
    } else {
      byLabel.set(key, {
        name: label,
        quantity: 1,
        unit: "台",
        category: def?.tradeType ?? plan.tradeType,
        source: "symbol",
        sourceRef: def?.symbolType ?? placed.id,
      });
    }
  }
  return [...byLabel.values()];
}

export function summarizeRoutesFromDrawing(plan: DrawingPlan): DrawingEstimateCandidateLine[] {
  const byType = new Map<string, DrawingEstimateCandidateLine>();
  for (const route of plan.routes) {
    const meta = ROUTE_LABELS[route.routeType] ?? ROUTE_LABELS.other;
    const key = route.routeType;
    const len = route.estimatedLength > 0 ? route.estimatedLength : 1;
    const prev = byType.get(key);
    if (prev) {
      prev.quantity += len;
    } else {
      byType.set(key, {
        name: meta.name,
        quantity: len,
        unit: meta.unit,
        category: plan.tradeType,
        source: "route",
        sourceRef: route.id,
      });
    }
  }
  return [...byType.values()];
}

export function createEstimateCandidateFromDrawingPlan(
  plan: DrawingPlan
): DrawingEstimateCandidate {
  const materials = summarizeMaterialsFromDrawing(plan);
  const routes = summarizeRoutesFromDrawing(plan);
  const lines = [...materials, ...routes];
  const parts = lines.map((l) => `${l.name} ${l.quantity}${l.unit}`);
  return {
    projectId: plan.projectId,
    drawingPlanId: plan.id,
    lines,
    summary: parts.length ? parts.join(" / ") : "配置・ルートなし",
    createdAt: new Date().toISOString(),
  };
}

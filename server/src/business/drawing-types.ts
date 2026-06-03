export const DRAWING_SOURCE_TYPES = ["hand_sketch", "photo", "floorplan", "blank"] as const;
export type DrawingSourceType = (typeof DRAWING_SOURCE_TYPES)[number];

export const DRAWING_TRADE_TYPES = [
  "security_camera",
  "aircon",
  "lighting",
  "electrical",
  "internet",
  "tv_antenna",
  "ventilation",
  "other",
] as const;
export type DrawingTradeType = (typeof DRAWING_TRADE_TYPES)[number];

export const DRAWING_ROUTE_TYPES = [
  "lan",
  "vvf",
  "coaxial",
  "refrigerant_pipe",
  "drain",
  "pf_pipe",
  "cd_pipe",
  "duct",
  "other",
] as const;
export type DrawingRouteType = (typeof DRAWING_ROUTE_TYPES)[number];

export interface DrawingSymbol {
  id: string;
  tradeType: DrawingTradeType;
  symbolType: string;
  label: string;
  icon: string;
  color: string;
  defaultEstimateItemId?: string | null;
  memo: string;
}

export interface DrawingPlacedSymbol {
  id: string;
  symbolId: string;
  x: number;
  y: number;
  rotation: number;
  label: string;
  memo: string;
  linkedPhotoIds: string[];
  estimateItemId?: string | null;
}

export interface DrawingRoutePoint {
  x: number;
  y: number;
}

export interface DrawingRoute {
  id: string;
  routeType: DrawingRouteType;
  points: DrawingRoutePoint[];
  color: string;
  lineStyle: string;
  estimatedLength: number;
  memo: string;
}

export interface DrawingPlan {
  id: string;
  projectId: string;
  title: string;
  sourceType: DrawingSourceType;
  backgroundImagePath: string;
  cleanImagePath: string;
  tradeType: DrawingTradeType;
  symbols: DrawingPlacedSymbol[];
  routes: DrawingRoute[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpecificationDocument {
  id: string;
  projectId: string;
  drawingPlanId: string;
  title: string;
  overview: string;
  includedTrades: DrawingTradeType[];
  materialSummary: string;
  workSummary: string;
  notes: string;
  pdfPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface DrawingEstimateCandidateLine {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  source: "symbol" | "route";
  sourceRef: string;
}

export interface DrawingEstimateCandidate {
  projectId: string;
  drawingPlanId: string;
  lines: DrawingEstimateCandidateLine[];
  summary: string;
  createdAt: string;
}

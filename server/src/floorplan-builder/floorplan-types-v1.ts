/**
 * 3D Floorplan Builder — JSON 契約
 * Security 俯瞰（rooms x/y/w/h %）と互換
 */

export type FloorplanFloorIdV1 = "1f" | "2f" | "outdoor";

export interface FloorplanPointV1 {
  x: number;
  y: number;
}

export interface FloorplanWallV1 {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FloorplanRoomV1 {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorplanOpeningV1 {
  id: string;
  kind: "entrance" | "backdoor" | "window" | "door";
  label: string;
  x: number;
  y: number;
}

export interface FloorplanFloorLayerV1 {
  id: FloorplanFloorIdV1;
  label: string;
  enabled: boolean;
  backgroundImage: string | null;
  gridCells: number;
  walls: FloorplanWallV1[];
  rooms: FloorplanRoomV1[];
  openings: FloorplanOpeningV1[];
}

export interface FloorplanRenderV1 {
  wallHeight: number;
  roomOpacity: number;
  glowColor: string;
  glowColorAlt: string;
  cameraElevationDeg: number;
}

export interface FloorplanSecurityBridgeV1 {
  siteId: string | null;
  rooms: Array<{
    id: string;
    floorId: FloorplanFloorIdV1;
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
  openings: Array<{
    id: string;
    floorId: FloorplanFloorIdV1;
    kind: string;
    label: string;
    x: number;
    y: number;
  }>;
}

export interface FloorplanConfigV1 {
  version: 1;
  id: string;
  name: string;
  presetId: string | null;
  scaleLabel: string;
  metersPerCell: number;
  activeFloor: FloorplanFloorIdV1;
  floors: FloorplanFloorLayerV1[];
  render: FloorplanRenderV1;
  security: FloorplanSecurityBridgeV1;
  updatedAt: string;
}

export const FLOORPLAN_LS_KEY_V1 = "tisly_floorplan_config";
export const FLOORPLAN_ACTIVE_KEY_V1 = "tisly_floorplan_active_id";

export const DEFAULT_FLOORPLAN_RENDER_V1: FloorplanRenderV1 = {
  wallHeight: 2.7,
  roomOpacity: 0.55,
  glowColor: "#059669",
  glowColorAlt: "#0284c7",
  cameraElevationDeg: 45,
};

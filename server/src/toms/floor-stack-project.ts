import { getBusinessProject } from "../business/business-store.js";
import { listProFloorLayers, ensureProFloorLayersSeed, type ProFloorLayerView } from "../pro-remote/floor-map-stack.js";
import { listProjectLiveDevices } from "./realtime-devices.js";

export interface ProjectFloorStackLayer extends ProFloorLayerView {
  anomalyCount: number;
  scrollTarget: boolean;
}

export interface ProjectFloorStack {
  customerCode: string;
  layers: ProjectFloorStackLayer[];
  firstAnomalyTier: string | null;
}

function projectCustomerCode(projectId: string): string | null {
  const project = getBusinessProject(projectId);
  if (!project) return null;
  if (project.customerId.startsWith("BCU-")) return "TOMS001";
  return "TOMS001";
}

export function buildProjectFloorStack(projectId: string): ProjectFloorStack | null {
  const code = projectCustomerCode(projectId);
  if (!code) return null;
  ensureProFloorLayersSeed();
  const live = listProjectLiveDevices(projectId);
  const layers = listProFloorLayers(code).map((layer) => {
    const tier = layer.tier;
    const tierDevices = live.filter((d) => {
      if (!d.floor) return tier === "perimeter";
      return d.floor === tier;
    });
    const anomalyCount = tierDevices.filter(
      (d) => d.status === "OFFLINE" || d.status === "WARNING"
    ).length;
    const pins = [
      ...layer.pins,
      ...tierDevices
        .filter((d) => d.pos_x != null && d.pos_y != null)
        .map((d) => ({
          id: d.device_id,
          pinType: d.device_type,
          label: d.name,
          posX: d.pos_x!,
          posY: d.pos_y!,
          deviceId: d.device_id,
          status: d.status,
        })),
    ];
    return { ...layer, pins, devices: layer.devices, anomalyCount, scrollTarget: false };
  });

  const firstBad = layers.find((l) => l.anomalyCount > 0);
  if (firstBad) firstBad.scrollTarget = true;

  return {
    customerCode: code,
    layers,
    firstAnomalyTier: firstBad?.tier ?? null,
  };
}

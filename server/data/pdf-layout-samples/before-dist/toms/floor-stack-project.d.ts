import { type ProFloorLayerView } from "../pro-remote/floor-map-stack.js";
export interface ProjectFloorStackLayer extends ProFloorLayerView {
    anomalyCount: number;
    scrollTarget: boolean;
}
export interface ProjectFloorStack {
    customerCode: string;
    layers: ProjectFloorStackLayer[];
    firstAnomalyTier: string | null;
}
export declare function buildProjectFloorStack(projectId: string): ProjectFloorStack | null;

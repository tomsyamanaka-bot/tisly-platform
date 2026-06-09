/**
 * Phase908 — ROI Simulator v2
 */
export interface RoiSimulatorInput {
    siteCount: number;
    dispatchCountPerYear: number;
    laborCostPerDispatch: number;
    vehicleCostPerDispatch: number;
    reductionRate?: number;
}
export interface RoiSimulatorResult {
    input: RoiSimulatorInput;
    costPerDispatch: number;
    annualDispatchCost: number;
    annualReductionJpy: number;
    monthlyReductionJpy: number;
    chart: Array<{
        label: string;
        value: number;
    }>;
}
export declare function calculateRoiV2(input: RoiSimulatorInput): RoiSimulatorResult;

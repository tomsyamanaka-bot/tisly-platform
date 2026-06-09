export interface SlaMetrics {
    uptimePercent: number;
    recoveryRatePercent: number;
    mttrMinutes: number;
    periodDays: number;
    totalIncidents: number;
    recoveredIncidents: number;
}
export declare function computeMttr(periodDays?: number): number;
export declare function getSlaMetrics(periodDays?: number): SlaMetrics;

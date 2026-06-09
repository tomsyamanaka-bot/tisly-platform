/**
 * Phase 1461–1500 — 5分毎 /api/health 監視 + 異常時アラート
 */
export interface HealthProbeResult {
    ok: boolean;
    status: string;
    issues: string[];
    checkedAt: string;
}
export declare function probeHealth(): HealthProbeResult;
export declare function startHealthMonitor(): void;
export declare function stopHealthMonitor(): void;
export declare function getHealthMonitorLogTail(lines?: number): string[];

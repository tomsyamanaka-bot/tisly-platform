import type { TislyEvent } from "../notification/types.js";
import { getPlaybook } from "./playbook.js";
import { getSlaMetrics, computeMttr } from "./sla-monitor.js";
import type { AiAlertPriority } from "../analytics/risk-score.js";
export declare function startRecoveryEngine(): void;
export declare function handleEventRecovery(event: TislyEvent, meta?: {
    riskScore?: number;
    priority?: string;
}): Promise<void>;
export declare function applyAiPriorityToEvent(event: TislyEvent, priority: AiAlertPriority): TislyEvent;
export declare function getRecoveryOverview(): {
    rules: import("./recovery-rules.js").RecoveryRule[];
    escalation: import("./escalation-engine.js").EscalationSchedule[];
    playbooks: import("./playbook.js").RecoveryPlaybook[];
    sla: import("./sla-monitor.js").SlaMetrics;
    mttr: number;
    recentRuns: any;
    timeline: import("./incident-timeline.js").TimelineEntry[];
};
export { getPlaybook, getSlaMetrics, computeMttr };

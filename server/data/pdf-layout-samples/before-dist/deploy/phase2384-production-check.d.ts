import { getLastGmailSendStatus } from "../notification/gmail-send-log.js";
import type { ProductionCheckItem, ProductionCheckStatus } from "./phase2381-production-check.js";
export interface Phase2384ProductionReport {
    phase: "2384";
    ready: boolean;
    shellVersion: string;
    shellTag: string;
    productionRatePercent: number;
    operationalReady: boolean;
    adminPasswordStatus: ProductionCheckStatus;
    gmailInfraStatus: "GREEN" | "YELLOW" | "RED";
    gmailMode: string;
    smtpConfigured: boolean;
    notificationTestToConfigured: boolean;
    gmailSendVerified: boolean;
    lastTestEmailOk: boolean;
    maskedCredentials: string;
    lastSendStatus: ReturnType<typeof getLastGmailSendStatus>;
    implemented: string[];
    mockRemaining: string[];
    nextPhase: string;
    checks: ProductionCheckItem[];
}
export declare function buildPhase2384ProductionCheck(env?: NodeJS.ProcessEnv): Phase2384ProductionReport;

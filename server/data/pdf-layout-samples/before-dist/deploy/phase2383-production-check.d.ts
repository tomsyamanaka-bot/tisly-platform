import { getLastGmailSendStatus } from "../notification/gmail-send-log.js";
import type { ProductionCheckItem, ProductionCheckStatus } from "./phase2381-production-check.js";
export interface Phase2383ProductionReport {
    phase: "2383";
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
    maskedCredentials: string;
    lastSendStatus: ReturnType<typeof getLastGmailSendStatus>;
    implemented: string[];
    mockRemaining: string[];
    nextPhase: string;
    checks: ProductionCheckItem[];
}
export declare function buildPhase2383ProductionCheck(env?: NodeJS.ProcessEnv): Phase2383ProductionReport;

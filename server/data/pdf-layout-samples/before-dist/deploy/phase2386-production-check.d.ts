import { getLastGmailSendStatus } from "../notification/gmail-send-log.js";
import type { ProductionCheckItem, ProductionCheckStatus } from "./phase2381-production-check.js";
export interface Phase2386ProductionReport {
    phase: "2386";
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
    pdfAttachmentEnabled: boolean;
    testEmailBodySafe: boolean;
    distRuntimeAligned: boolean;
    gmailTestModalUi: boolean;
    lastTestEmailOk: boolean;
    maskedCredentials: string;
    attachmentFileName: string;
    lastSendStatus: ReturnType<typeof getLastGmailSendStatus>;
    implemented: string[];
    mockRemaining: string[];
    nextPhase: string;
    checks: ProductionCheckItem[];
}
export declare function buildPhase2386ProductionCheck(env?: NodeJS.ProcessEnv): Phase2386ProductionReport;

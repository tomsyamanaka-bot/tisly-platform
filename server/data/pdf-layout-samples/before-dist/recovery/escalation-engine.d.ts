export type EscalationTier = "L1" | "L2" | "L3";
export interface EscalationSchedule {
    tier: EscalationTier;
    afterSec: number;
    channels: Array<"web_push" | "discord" | "email">;
    label: string;
}
/** 30秒 → 5分 → 30分 で通知先を変更 */
export declare const DEFAULT_ESCALATION: EscalationSchedule[];
export declare function tierForElapsed(elapsedSec: number): EscalationSchedule;

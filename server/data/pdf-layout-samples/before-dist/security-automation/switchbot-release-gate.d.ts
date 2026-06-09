/**
 * Phase 1321–1340 — SwitchBot & Security Automation release gate checks
 */
import type { DryRunCheckItem } from "../deploy/deploy-dry-run.js";
export type SwitchBotGateLabel = "初回公開OK" | "実機前チェック" | "本番注意";
export declare function switchBotModeLabel(mode: string): SwitchBotGateLabel;
export declare function buildSwitchBotReleaseGateChecks(source?: NodeJS.ProcessEnv): DryRunCheckItem[];
export declare function buildSwitchBotDeploymentChecklist(): Array<{
    id: string;
    label: string;
    ok: boolean;
    detail: string;
}>;

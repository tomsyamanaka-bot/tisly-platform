export type EnvCheckLevel = "info" | "warning" | "error";
export interface EnvCheckItem {
    key: string;
    level: EnvCheckLevel;
    message: string;
    hint?: string;
}
export interface MockRealGuard {
    service: string;
    envKeys: string[];
    mockDefault: string;
    realValue: string;
    demoSafe: string;
    realRisks: string[];
    guardLocation: string;
}
/** Demo / Mock / Real 切替と real 時の危険一覧（docs/mock_real_modes.md と同期） */
export declare const MOCK_REAL_GUARDS: MockRealGuard[];
export declare function checkProductionEnv(source?: NodeJS.ProcessEnv): EnvCheckItem[];
export declare function hasBlockingEnvErrors(source?: NodeJS.ProcessEnv): boolean;
/** 起動前にコンソールへ warning/error を出力（NODE_ENV=test ではスキップ） */
export declare function logProductionEnvWarnings(source?: NodeJS.ProcessEnv): void;

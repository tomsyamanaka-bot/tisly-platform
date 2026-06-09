import type { InputStateChange } from "./security-demo-state.js";
import { type SecurityMode } from "./security-demo-state.js";
export declare function processSecurityInputChanges(changes: InputStateChange[]): Promise<void>;
export declare function notifySecurityModeChange(mode: SecurityMode): Promise<void>;
export declare function getSecurityModeLabel(): SecurityMode;

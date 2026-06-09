import { type ChStateChange, type InputStateChange } from "./remote-test-state.js";
export declare function notifyChStateChanges(changes: ChStateChange[]): Promise<void>;
export declare function notifyInputStateChanges(changes: InputStateChange[]): Promise<void>;

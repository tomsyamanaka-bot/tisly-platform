import type { TislyEvent, EventSeverity } from "./types.js";
export declare function classifySeverity(eventType: string): EventSeverity;
export declare function shouldNotify(eventType: string): boolean;
export declare function persistEvent(event: TislyEvent): string;
export declare function parseMqttPayload(topic: string, raw: string): TislyEvent | null;

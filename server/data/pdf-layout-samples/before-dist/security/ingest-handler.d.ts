import type { Response } from "express";
import type { UnifiedEvent } from "../event/unified-event.js";
export declare function ingestUnifiedEvent(unified: UnifiedEvent, res: Response, meta?: {
    sourceIp?: string;
}): Promise<void>;

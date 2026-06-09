export declare const TOMS_WORKFLOW_STATES: readonly ["draft", "survey", "estimate", "approved", "construction", "completed", "invoiced", "paid", "maintenance", "closed"];
export type TomsWorkflowState = (typeof TOMS_WORKFLOW_STATES)[number];
export declare const TIMELINE_EVENT_TYPES: readonly ["project_created", "survey", "drawing", "ai_estimate", "estimate_sent", "construction_start", "construction_complete", "completion_report", "invoice", "payment", "maintenance_start", "maintenance_complete", "pro_operations"];
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];
export declare const CONSTRUCTION_PHOTO_CATEGORIES: readonly ["before", "during", "after", "panel_interior", "wiring", "equipment", "finished"];
export type ConstructionPhotoCategory = (typeof CONSTRUCTION_PHOTO_CATEGORIES)[number];
export declare const ASSET_TYPES: readonly ["esp", "shelly", "camera", "nvr", "router", "sensor", "light", "plc", "other"];
export type TomsAssetType = (typeof ASSET_TYPES)[number];

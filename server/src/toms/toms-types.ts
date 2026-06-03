export const TOMS_WORKFLOW_STATES = [
  "draft",
  "survey",
  "estimate",
  "approved",
  "construction",
  "completed",
  "invoiced",
  "paid",
  "maintenance",
  "closed",
] as const;

export type TomsWorkflowState = (typeof TOMS_WORKFLOW_STATES)[number];

export const TIMELINE_EVENT_TYPES = [
  "project_created",
  "survey",
  "drawing",
  "ai_estimate",
  "estimate_sent",
  "construction_start",
  "construction_complete",
  "completion_report",
  "invoice",
  "payment",
  "maintenance_start",
  "maintenance_complete",
  "pro_operations",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const CONSTRUCTION_PHOTO_CATEGORIES = [
  "before",
  "during",
  "after",
  "panel_interior",
  "wiring",
  "equipment",
  "finished",
] as const;

export type ConstructionPhotoCategory = (typeof CONSTRUCTION_PHOTO_CATEGORIES)[number];

export const ASSET_TYPES = [
  "esp",
  "shelly",
  "camera",
  "nvr",
  "router",
  "sensor",
  "light",
  "plc",
  "other",
] as const;

export type TomsAssetType = (typeof ASSET_TYPES)[number];

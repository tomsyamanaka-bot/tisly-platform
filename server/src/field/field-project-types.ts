export const BUILDING_TYPES = [
  "detached_house",
  "apartment",
  "office",
  "store",
  "warehouse",
  "other",
] as const;

export type BuildingType = (typeof BUILDING_TYPES)[number];

export const PLAN_CANDIDATES = ["basic", "standard", "premium", "custom"] as const;
export type PlanCandidate = (typeof PLAN_CANDIDATES)[number];

export interface FieldProjectInput {
  customerCode?: string;
  customerName: string;
  address: string;
  buildingType: BuildingType | string;
  planCandidates: string[];
  surveyStaff: string;
  scheduledDate: string;
  memo?: string;
}

export interface FieldProjectRecord {
  id: string;
  customerCode: string;
  customerName: string;
  address: string;
  buildingType: string;
  planCandidates: string[];
  surveyStaff: string;
  scheduledDate: string;
  memo: string;
  surveyProjectId: string;
  businessProjectId: string;
  createdAt: string;
  updatedAt: string;
}

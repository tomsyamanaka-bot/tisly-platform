/**
 * Phase16-1 — 案件ステータス自動同期（現調/見積/請求/完了報告の保存時）
 */
import { getBusinessProject, updateBusinessProject } from "../business/business-store.js";
import type { BusinessProjectStatus } from "../business/business-types.js";
import { normalizeProjectStatus } from "../business/business-status.js";
import { findBusinessProjectBySurvey } from "../field-operations/project-estimate-v4.js";
import { addProjectTimelineEventV1 } from "./project-timeline-v1-store.js";
import {
  deriveProjectStatusFromRowV1,
  PROJECT_MGMT_STATUS_LABELS,
} from "./project-mgmt-status-v1.js";
import {
  deriveOperationalStatusV1,
  OPERATIONAL_STATUS_LABELS_V1,
} from "./operational-status-v1.js";
import { getProjectDocumentsStatusV1 } from "./project-documents-v1.js";
import { getDatabase } from "../db/database.js";

export type ProjectStatusAutoTriggerV1 =
  | "survey_saved"
  | "estimate_created"
  | "invoice_created"
  | "completion_saved";

const TRIGGER_TARGET: Record<ProjectStatusAutoTriggerV1, BusinessProjectStatus> = {
  survey_saved: "survey_done",
  estimate_created: "estimate_sent",
  invoice_created: "invoice_created",
  completion_saved: "completion_report_created",
};

const TRIGGER_LABELS: Record<ProjectStatusAutoTriggerV1, string> = {
  survey_saved: "現調保存",
  estimate_created: "見積作成",
  invoice_created: "請求作成",
  completion_saved: "完了報告保存",
};

/** ステータス進行の優先度（大きいほど後段） */
const STATUS_RANK: Record<string, number> = {
  new: 0,
  survey_scheduled: 10,
  survey_done: 20,
  estimate_created: 30,
  estimate_sent: 40,
  construction_scheduled: 50,
  construction_done: 60,
  completion_report_created: 70,
  invoice_created: 80,
  invoice_sent: 85,
  partial_paid: 90,
  paid: 95,
  closed: 100,
};

function statusRank(status: string): number {
  return STATUS_RANK[normalizeProjectStatus(status)] ?? 0;
}

export interface ProjectStatusAutoSyncResultV1 {
  projectId: string;
  changed: boolean;
  previousBusinessStatus: string;
  businessStatus: string;
  mgmtStatusLabel: string;
  operationalLabel: string;
  trigger: ProjectStatusAutoTriggerV1;
}

export function syncProjectStatusAutoV1(
  projectId: string,
  trigger: ProjectStatusAutoTriggerV1
): ProjectStatusAutoSyncResultV1 | null {
  const project = getBusinessProject(projectId);
  if (!project) return null;

  const target = TRIGGER_TARGET[trigger];
  const previous = normalizeProjectStatus(project.status);
  let next = previous;

  if (statusRank(target) > statusRank(previous)) {
    updateBusinessProject(projectId, { status: target }, { skipTransitionCheck: true });
    next = target;
  }

  const row = getDatabase()
    .prepare(`SELECT * FROM business_projects WHERE id = ?`)
    .get(projectId) as Record<string, unknown>;
  const mgmtStatus = deriveProjectStatusFromRowV1(row);
  const completionDoc = getProjectDocumentsStatusV1(projectId)?.documents.find(
    (d) => d.kind === "completion"
  );
  const operationalLabel =
    OPERATIONAL_STATUS_LABELS_V1[
      deriveOperationalStatusV1(mgmtStatus, { hasCompletionPdf: Boolean(completionDoc?.hasPdf) })
    ];

  if (next !== previous) {
    addProjectTimelineEventV1({
      projectId,
      eventType: "status_auto",
      title: "ステータス自動更新",
      description: `${TRIGGER_LABELS[trigger]} → ${operationalLabel}（${PROJECT_MGMT_STATUS_LABELS[mgmtStatus]}）`,
    });
  }

  return {
    projectId,
    changed: next !== previous,
    previousBusinessStatus: previous,
    businessStatus: next,
    mgmtStatusLabel: PROJECT_MGMT_STATUS_LABELS[mgmtStatus],
    operationalLabel,
    trigger,
  };
}

/** 現調プロジェクト ID から紐づく business 案件のステータスを同期 */
export function syncProjectStatusAutoBySurveyV1(
  surveyProjectId: string,
  trigger: ProjectStatusAutoTriggerV1 = "survey_saved"
): ProjectStatusAutoSyncResultV1 | null {
  const businessProjectId = findBusinessProjectBySurvey(surveyProjectId);
  if (!businessProjectId) return null;
  return syncProjectStatusAutoV1(businessProjectId, trigger);
}

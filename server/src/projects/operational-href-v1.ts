/** 実運用フェーズ1 — 案件詳細から各PWAへの遷移（return 引継ぎ） */

export function appendReturnParam(href: string | null, returnUrl: string): string | null {
  if (!href) return null;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}return=${encodeURIComponent(returnUrl)}`;
}

export function buildDetailReturnUrl(projectId: string, tab?: string): string {
  const params = new URLSearchParams({ projectId });
  if (tab) params.set("tab", tab);
  return `/project-mgmt-detail-v1?${params}`;
}

export interface OperationalWorkflowHrefsV1 {
  survey: string | null;
  drawing: string | null;
  estimate: string;
  invoice: string;
  completion: string;
}

export function buildOperationalWorkflowHrefsV1(input: {
  projectId: string;
  surveyProjectId: string | null;
  detailReturnUrl: string;
}): OperationalWorkflowHrefsV1 {
  const ret = input.detailReturnUrl;
  const surveyBase = input.surveyProjectId
    ? `/survey-v1?projectId=${encodeURIComponent(input.surveyProjectId)}`
    : "/survey-v1";
  const drawingBase = input.surveyProjectId
    ? `/survey-drawing-v1?projectId=${encodeURIComponent(input.surveyProjectId)}`
    : "/survey-drawing-v1";
  const estimateBase = `/estimate-v1?projectId=${encodeURIComponent(input.projectId)}`;
  const invoiceBase = `${estimateBase}&tab=invoice`;
  const completionBase = `/projects-v1?projectId=${encodeURIComponent(input.projectId)}&source=business`;

  return {
    survey: appendReturnParam(surveyBase, ret),
    drawing: appendReturnParam(drawingBase, ret),
    estimate: appendReturnParam(estimateBase, ret) ?? estimateBase,
    invoice: appendReturnParam(invoiceBase, ret) ?? invoiceBase,
    completion: appendReturnParam(completionBase, ret) ?? completionBase,
  };
}

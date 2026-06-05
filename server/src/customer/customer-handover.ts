import { config } from "../config.js";
import {
  customerUrls,
  getCustomerByCode,
  listDevicesForCustomer,
} from "../customer/customer-store.js";
import { getDatabase } from "../db/database.js";
import { listDeploymentAssets } from "../deployment-kit/qr-management.js";
import { getCustomerContact } from "../deployment-kit/customer-wizard.js";
import { listMaintenanceSchedules } from "../maintenance/maintenance-schedule.js";
import { getCompletionReport, getBusinessProject } from "../business/business-store.js";
import { getDeploymentChecklistRC2 } from "../deployment-kit/deployment-checklist-rc2.js";

export interface CustomerHandoverPackage {
  customerCode: string;
  customerName: string;
  generatedAt: string;
  equipment: Array<{ deviceId: string; label: string; kind: string; status: string }>;
  qrList: Array<{ assetId: string; deviceId: string; label: string; url: string }>;
  constructionPhotos: Array<{ url: string; caption: string }>;
  completionReport: { title: string; workMemo: string; pdfUrl: string | null } | null;
  maintenanceSchedule: Array<{ title: string; dueDate: string; status: string }>;
  emergencyContact: { phone: string; email: string; hours: string };
  loginUrl: string;
  tvUrl: string;
  proRemoteUrl: string;
  handoverUrl: string;
  deploymentChecklist: ReturnType<typeof getDeploymentChecklistRC2>;
}

export function buildCustomerHandoverPackage(customerCode: string): CustomerHandoverPackage | null {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return null;

  const urls = customerUrls(customerCode);
  const devices = listDevicesForCustomer(customer.customer_id);
  const qrAssets = listDeploymentAssets(customerCode);

  const bizProject = getDatabase()
    .prepare(
      `SELECT id FROM business_projects WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(customerCode) as { id: string } | undefined;

  let constructionPhotos: CustomerHandoverPackage["constructionPhotos"] = [];
  let completionReport: CustomerHandoverPackage["completionReport"] = null;

  if (bizProject) {
    const project = getBusinessProject(bizProject.id);
    if (project?.constructionPhotos?.length) {
      constructionPhotos = project.constructionPhotos.map((p) => ({
        url: p.urlPath,
        caption: p.caption ?? p.fileName,
      }));
    }
    if (project?.completionReportId) {
      const report = getCompletionReport(project.completionReportId);
      if (report) {
        completionReport = {
          title: report.title,
          workMemo: report.workMemo,
          pdfUrl: report.pdfPath ? `/uploads/business/${report.pdfPath.replace(/^.*[/\\]/, "")}` : null,
        };
      }
    }
  }

  const schedules = listMaintenanceSchedules(customerCode);
  const checklist = bizProject ? getDeploymentChecklistRC2(bizProject.id) : null;

  const contact = getCustomerContact(customer.customer_id);

  const base = config.publicUrl.replace(/\/$/, "");

  return {
    customerCode: customer.customer_code,
    customerName: customer.customer_name,
    generatedAt: new Date().toISOString(),
    equipment: devices.map((d) => ({
      deviceId: d.deviceId,
      label: d.label ?? d.deviceId,
      kind: d.deviceType,
      status: d.deviceStatus ?? "UNKNOWN",
    })),
    qrList: qrAssets.map((a) => ({
      assetId: a.assetId,
      deviceId: a.deviceId,
      label: a.label,
      url: `${base}/asset/${a.assetId}`,
    })),
    constructionPhotos,
    completionReport,
    maintenanceSchedule: schedules.map((s) => ({
      title: s.title,
      dueDate: s.dueDate,
      status: s.status,
    })),
    emergencyContact: {
      phone: contact?.phone ?? "03-0000-0000",
      email: contact?.email ?? "support@tisly.jp",
      hours: "平日 9:00–18:00 / 緊急時 24hコールセンター",
    },
    loginUrl: `${base}${urls.customer}`,
    tvUrl: `${base}${urls.tv}`,
    proRemoteUrl: `${base}/customer/${customerCode}/pro-remote`,
    handoverUrl: `${base}/customer/${customerCode}/handover`,
    deploymentChecklist: checklist,
  };
}

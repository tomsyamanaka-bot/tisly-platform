import { getCustomerByCode, listDevicesForCustomer } from "./customer-store.js";
import { listAssetQrHistory } from "../assets/asset-qr.js";
import { listMaintenanceReports } from "../maintenance/maintenance-schedule.js";
import { getDatabase } from "../db/database.js";
import { listMaintenanceCases } from "../maintenance/maintenance-store.js";
export function buildCustomerPortalFieldView(customerCode) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return null;
    const devices = listDevicesForCustomer(customer.customer_id).map((d) => ({
        deviceId: d.deviceId,
        label: d.label ?? d.deviceId,
        deviceType: d.deviceType ?? "unknown",
        status: d.deviceStatus ?? d.heartbeatStatus ?? "unknown",
    }));
    const cameras = devices.filter((d) => d.deviceType.toLowerCase().includes("camera") ||
        d.label.toLowerCase().includes("カメラ") ||
        d.label.toLowerCase().includes("camera"));
    const qrAssets = listAssetQrHistory({ customerCode, limit: 50 });
    const completionRows = getDatabase()
        .prepare(`SELECT bp.id, bp.title, bcr.pdf_path, bcr.created_at
       FROM business_projects bp
       LEFT JOIN business_completion_reports bcr ON bp.completion_report_id = bcr.id
       WHERE bp.customer_id = ? AND bp.completion_report_id IS NOT NULL
       ORDER BY bcr.created_at DESC LIMIT 20`)
        .all(customer.customer_id);
    const completionReports = completionRows.map((r) => ({
        projectId: String(r.id),
        title: String(r.title),
        pdfPath: r.pdf_path != null ? String(r.pdf_path) : null,
        createdAt: String(r.created_at ?? ""),
    }));
    const notificationRows = getDatabase()
        .prepare(`SELECT id, message, severity, created_at FROM events
       WHERE tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?)
       ORDER BY created_at DESC LIMIT 30`)
        .all(customer.tenant_id ?? customer.customer_id, customer.customer_id);
    const notificationHistory = notificationRows.map((r) => ({
        id: String(r.id),
        message: String(r.message ?? ""),
        severity: String(r.severity ?? "info"),
        createdAt: String(r.created_at),
    }));
    return {
        customerCode: customer.customer_code,
        ownerOnly: true,
        devices,
        cameras,
        qrAssets,
        completionReports,
        maintenanceHistory: listMaintenanceReports(customerCode, 30),
        maintenanceCases: listMaintenanceCases(customerCode),
        notificationHistory,
    };
}

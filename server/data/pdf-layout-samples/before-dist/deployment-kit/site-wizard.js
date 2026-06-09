/**
 * Phase 1001–1040 — Site Wizard with standard templates
 */
import { getCustomerByCode, getCustomerById } from "../customer/customer-store.js";
import { createSite as provisionSite } from "../provisioning/site-provisioner.js";
import { getDatabase } from "../db/database.js";
import { listTemplates } from "../provisioning/site-templates.js";
import { logAudit } from "../provisioning/audit-log.js";
const SITE_TYPE_LABELS = {
    kodate: "戸建",
    minpaku: "民泊",
    factory: "工場",
    warehouse: "倉庫",
    kaigo: "介護",
    other: "その他",
};
export function listDeploymentSiteTypes() {
    return Object.keys(SITE_TYPE_LABELS).map((id) => ({
        id,
        label: SITE_TYPE_LABELS[id],
        templateId: id === "kaigo" || id === "other" ? id : id,
    }));
}
export function createSiteWizard(input) {
    const customer = getCustomerByCode(input.customerCode);
    if (!customer)
        throw new Error("customer not found");
    const label = SITE_TYPE_LABELS[input.siteType] ?? "現場";
    const siteName = input.name ?? `${label} — ${customer.customer_name}`;
    const provisioned = provisionSite({
        name: siteName,
        tenantId: customer.tenant_id ?? customer.customer_id,
        templateId: input.siteType,
        address: input.address,
        actorLabel: input.actorLabel ?? "Deployment Wizard",
    });
    const db = getDatabase();
    db.prepare(`UPDATE sites SET customer_id = ?, timezone = 'Asia/Tokyo' WHERE id = ?`).run(customer.customer_id, provisioned.site.id);
    for (const d of provisioned.devices) {
        db.prepare(`UPDATE devices SET customer_id = ? WHERE id = ?`).run(customer.customer_id, d.id);
    }
    logAudit({
        tenantId: customer.tenant_id ?? customer.customer_id,
        siteId: provisioned.site.id,
        action: "deployment.site.create",
        entityType: "site",
        entityId: provisioned.site.id,
        details: { siteType: input.siteType, zoneCount: provisioned.zones.length },
    });
    return {
        customerCode: customer.customer_code,
        siteType: input.siteType,
        siteTypeLabel: label,
        site: provisioned.site,
        zones: provisioned.zones,
        devices: provisioned.devices,
        templates: listTemplates(),
    };
}
export function listSitesForCustomerCode(customerCode) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return [];
    return getDatabase()
        .prepare(`SELECT id, name, site_type, address, template_id, status, created_at
       FROM sites WHERE customer_id = ? OR tenant_id = ?
       ORDER BY name`)
        .all(customer.customer_id, customer.tenant_id ?? customer.customer_id);
}
export function getSiteWizardContext(customerId) {
    const customer = getCustomerById(customerId);
    if (!customer)
        return null;
    return {
        customer,
        siteTypes: listDeploymentSiteTypes(),
        sites: listSitesForCustomerCode(customer.customer_code),
    };
}

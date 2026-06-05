/**
 * Phase 1071–1080 — Customer onboarding automation (一括導入)
 */
import { getCustomerByCode } from "../customer/customer-store.js";
import { config } from "../config.js";
import {
  createCustomerWizard,
  generateNextCustomerCode,
  type CustomerWizardInput,
} from "./customer-wizard.js";
import { createSiteWizard, type DeploymentSiteType } from "./site-wizard.js";
import { provisionDeploymentDevice, type DeploymentDeviceKind } from "./device-provision.js";
import type { CustomerPlan } from "../customer/types.js";
import { logAudit } from "../provisioning/audit-log.js";

export interface OnboardingDeviceInput {
  name: string;
  location: string;
  kind: DeploymentDeviceKind;
  deviceId?: string;
}

export interface CustomerOnboardingInput {
  customerName: string;
  customerCode?: string;
  siteName: string;
  plan?: CustomerPlan;
  address?: string;
  siteType?: DeploymentSiteType;
  devices: OnboardingDeviceInput[];
}

export interface CustomerOnboardingResult {
  phase: string;
  customer: {
    customerId: string;
    customerCode: string;
    customerName: string;
    plan: string;
    initialPassword: string;
    loginUsername: string;
  };
  site: {
    id: string;
    name: string;
    zones: Array<{ id: string; name: string }>;
  };
  devices: Array<{
    deviceId: string;
    assetId: string;
    name: string;
    kind: string;
    qrDataUrl: string;
  }>;
  qrLinks: Array<{
    assetId: string;
    deviceId: string;
    url: string;
    qrPageUrl: string;
  }>;
  checklistUrl: string;
  deployUrl: string;
  installUrl: string;
  onboardingWizardUrl: string;
}

export function createCustomerOnboarding(input: CustomerOnboardingInput): CustomerOnboardingResult {
  if (!input.customerName?.trim()) throw new Error("customerName required");
  if (!input.siteName?.trim()) throw new Error("siteName required");
  if (!input.devices?.length) throw new Error("devices array required (at least one device)");

  let customerCode = input.customerCode?.toUpperCase().trim();
  if (customerCode) {
    if (getCustomerByCode(customerCode)) {
      throw new Error(`customer code ${customerCode} already exists`);
    }
  } else {
    customerCode = generateNextCustomerCode("TOMS");
  }

  const wizardInput: CustomerWizardInput & { customerCode?: string } = {
    customerName: input.customerName,
    siteName: input.siteName,
    address: input.address,
    plan: input.plan ?? "PRO_REMOTE",
    customerCode,
  };

  const customerResult = createCustomerWizard(wizardInput);

  const siteResult = createSiteWizard({
    customerCode: customerResult.customerCode,
    siteType: input.siteType ?? "kodate",
    name: input.siteName,
    address: input.address,
    actorLabel: "Onboarding Wizard",
  });

  const provisionedDevices: CustomerOnboardingResult["devices"] = [];
  const qrLinks: CustomerOnboardingResult["qrLinks"] = [];
  const baseUrl = config.publicUrl.replace(/\/$/, "");

  for (const dev of input.devices) {
    const p = provisionDeploymentDevice({
      customerCode: customerResult.customerCode,
      siteId: siteResult.site.id,
      name: dev.name,
      location: dev.location,
      kind: dev.kind,
      deviceId: dev.deviceId,
    });
    provisionedDevices.push({
      deviceId: p.deviceId,
      assetId: p.assetId,
      name: p.name,
      kind: dev.kind,
      qrDataUrl: p.qrDataUrl,
    });
    qrLinks.push({
      assetId: p.assetId,
      deviceId: p.deviceId,
      url: `${baseUrl}/asset/${p.assetId}`,
      qrPageUrl: `${baseUrl}/asset/${p.assetId}`,
    });
  }

  const code = customerResult.customerCode;
  logAudit({
    tenantId: customerResult.customer.tenant_id ?? customerResult.customer.customer_id,
    action: "deployment.onboarding.create",
    entityType: "customer",
    entityId: customerResult.customer.customer_id,
    details: {
      customerCode: code,
      siteId: siteResult.site.id,
      deviceCount: provisionedDevices.length,
    },
  });

  return {
    phase: "1071-1080",
    customer: {
      customerId: customerResult.customer.customer_id,
      customerCode: code,
      customerName: input.customerName,
      plan: customerResult.customer.plan,
      initialPassword: customerResult.initialPassword,
      loginUsername: customerResult.loginUsername,
    },
    site: {
      id: siteResult.site.id,
      name: siteResult.site.name ?? input.siteName,
      zones: siteResult.zones.map((z) => ({ id: z.id, name: z.name })),
    },
    devices: provisionedDevices,
    qrLinks,
    checklistUrl: `${baseUrl}/deployment/checklist?customerCode=${code}`,
    deployUrl: `${baseUrl}/customer/${code}/deploy`,
    installUrl: `${baseUrl}/customer/${code}/install/home`,
    onboardingWizardUrl: `${baseUrl}/onboarding/new`,
  };
}

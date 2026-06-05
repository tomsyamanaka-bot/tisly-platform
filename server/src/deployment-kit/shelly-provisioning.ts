/**
 * Phase 1051–1060 — Shelly Gen3 provisioning as TiSLY remote power device
 */
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { config } from "../config.js";
import {
  fetchShellyDeviceStatus,
  getShellyEnvMode,
  shellyReboot,
  type ShellyStatusResult,
} from "../device/shelly-real-client.js";
import { provisionDeploymentDevice, type DeploymentDeviceInput } from "./device-provision.js";
import { updateChecklistItem } from "./deployment-checklist.js";

export interface ShellyRegisterInput {
  customerCode: string;
  siteId: string;
  name: string;
  location: string;
  deviceId?: string;
  baseUrl?: string;
}

export interface ShellyRegisterResult {
  ok: boolean;
  mode: "mock" | "real";
  device: {
    deviceId: string;
    assetId: string;
    name: string;
    location: string;
    siteId: string;
    customerCode: string;
    qrDataUrl: string;
  };
  shellyStatus: ShellyStatusResult;
}

export function getShellyProvisioningStatus(): {
  phase: string;
  mode: "mock" | "real";
  baseUrlConfigured: boolean;
  authConfigured: boolean;
} {
  return {
    phase: "1051-1060",
    mode: getShellyEnvMode(),
    baseUrlConfigured: !!config.shelly.baseUrl?.trim(),
    authConfigured: !!config.shelly.authToken?.trim(),
  };
}

export async function registerShellyDevice(input: ShellyRegisterInput): Promise<ShellyRegisterResult> {
  const mode = getShellyEnvMode();
  const provisionInput: DeploymentDeviceInput = {
    customerCode: input.customerCode,
    siteId: input.siteId,
    name: input.name,
    location: input.location,
    kind: "Shelly",
    deviceId: input.deviceId,
  };

  const provisioned = provisionDeploymentDevice(provisionInput);

  if (input.baseUrl) {
    const db = getDatabase();
    const row = db
      .prepare(`SELECT id, metadata_json FROM devices WHERE device_id = ?`)
      .get(provisioned.deviceId) as { id: string; metadata_json: string | null } | undefined;
    if (row) {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(row.metadata_json ?? "{}") as Record<string, unknown>;
      } catch {
        /* */
      }
      meta.shelly_base_url = input.baseUrl;
      meta.shelly_registered_at = new Date().toISOString();
      db.prepare(`UPDATE devices SET metadata_json = ? WHERE id = ?`).run(
        JSON.stringify(meta),
        row.id
      );
    }
  }

  try {
    updateChecklistItem(input.customerCode, "shelly", true);
  } catch {
    /* customer may not have checklist row */
  }

  const shellyStatus = await fetchShellyDeviceStatus(input.baseUrl);

  return {
    ok: true,
    mode,
    device: {
      deviceId: provisioned.deviceId,
      assetId: provisioned.assetId,
      name: provisioned.name,
      location: provisioned.location,
      siteId: provisioned.siteId,
      customerCode: provisioned.customerCode,
      qrDataUrl: provisioned.qrDataUrl,
    },
    shellyStatus,
  };
}

export async function testShellyConnection(input?: {
  baseUrl?: string;
  deviceId?: string;
  customerCode?: string;
}): Promise<ShellyStatusResult & { ok: boolean; deviceId?: string }> {
  let baseUrl = input?.baseUrl;
  if (!baseUrl && input?.deviceId && input?.customerCode) {
    const customer = getCustomerByCode(input.customerCode);
    if (customer) {
      const row = getDatabase()
        .prepare(
          `SELECT metadata_json FROM devices WHERE device_id = ? AND customer_id = ?`
        )
        .get(input.deviceId, customer.customer_id) as { metadata_json: string | null } | undefined;
      if (row?.metadata_json) {
        try {
          const meta = JSON.parse(row.metadata_json) as { shelly_base_url?: string };
          baseUrl = meta.shelly_base_url;
        } catch {
          /* */
        }
      }
    }
  }

  const status = await fetchShellyDeviceStatus(baseUrl);
  const ok = status.mock || (status.mode === "real" && status.online);
  return { ...status, ok, deviceId: input?.deviceId };
}

export async function rebootShellyDevice(input: {
  confirm?: boolean;
  dryRun?: boolean;
  baseUrl?: string;
}) {
  return shellyReboot(input);
}

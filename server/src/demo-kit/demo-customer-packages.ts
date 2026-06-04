/**
 * Phase907 — 営業用ワンクリックデモパッケージ
 */
import { ensureDemoKit } from "./demo-reset.js";
import { DEMO_PACK_CODES } from "./demo-customer-pack.js";
import { triggerDemoNotification } from "./demo-notifications.js";
import { setDeviceMode, type DeviceMode } from "../device/device-mode-store.js";

export const DEMO_PACKAGE_TYPES = [
  "house",
  "minpaku",
  "factory",
  "warehouse",
  "care",
] as const;

export type DemoPackageType = (typeof DEMO_PACKAGE_TYPES)[number];

export interface DemoPackageMeta {
  type: DemoPackageType;
  label: string;
  customerCode: string;
  deviceMode: DeviceMode;
  description: string;
}

const PACKAGES: DemoPackageMeta[] = [
  { type: "house", label: "戸建て", customerCode: "TOMS001", deviceMode: "mock", description: "戸建て向け — 外周・1F・2F・ESP/Shelly" },
  { type: "minpaku", label: "民泊", customerCode: "MINPAKU-DEMO", deviceMode: "mixed", description: "民泊向け — 複数部屋・カメラ重点" },
  { type: "factory", label: "工場", customerCode: "FACTORY-DEMO", deviceMode: "mixed", description: "工場向け — PLC・大規模ゾーン" },
  { type: "warehouse", label: "倉庫", customerCode: "FACTORY-DEMO", deviceMode: "mock", description: "倉庫向け — 外周・搬入口" },
  { type: "care", label: "介護", customerCode: "TISLY-DEMO", deviceMode: "mock", description: "介護施設向け — 見守り・緊急ボタン" },
];

export function listDemoPackages(): DemoPackageMeta[] {
  return PACKAGES;
}

export async function launchDemoPackage(type: DemoPackageType): Promise<{
  ok: boolean;
  package: DemoPackageMeta;
  steps: string[];
}> {
  const pkg = PACKAGES.find((p) => p.type === type);
  if (!pkg) throw new Error(`Unknown package: ${type}`);
  if (!DEMO_PACK_CODES.includes(pkg.customerCode as (typeof DEMO_PACK_CODES)[number])) {
    throw new Error(`Invalid customer for package: ${pkg.customerCode}`);
  }

  setDeviceMode(pkg.deviceMode);
  ensureDemoKit();
  const steps: string[] = [`deviceMode=${pkg.deviceMode}`, `customer=${pkg.customerCode}`];

  if (type === "house") {
    await triggerDemoNotification("intrusion", pkg.customerCode);
    steps.push("intrusion_demo");
  } else if (type === "minpaku") {
    await triggerDemoNotification("maintenance_due", pkg.customerCode);
    steps.push("maintenance_notify");
  } else if (type === "factory" || type === "warehouse") {
    await triggerDemoNotification("esp_fault", pkg.customerCode);
    steps.push("esp_fault_demo");
  } else if (type === "care") {
    await triggerDemoNotification("maintenance_due", pkg.customerCode);
    steps.push("care_notify");
  }

  return { ok: true, package: pkg, steps };
}

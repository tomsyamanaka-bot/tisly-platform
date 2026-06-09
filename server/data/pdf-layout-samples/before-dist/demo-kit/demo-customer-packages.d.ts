import { type DeviceMode } from "../device/device-mode-store.js";
export declare const DEMO_PACKAGE_TYPES: readonly ["house", "minpaku", "factory", "warehouse", "care"];
export type DemoPackageType = (typeof DEMO_PACKAGE_TYPES)[number];
export interface DemoPackageMeta {
    type: DemoPackageType;
    label: string;
    customerCode: string;
    deviceMode: DeviceMode;
    description: string;
}
export declare function listDemoPackages(): DemoPackageMeta[];
export declare function launchDemoPackage(type: DemoPackageType): Promise<{
    ok: boolean;
    package: DemoPackageMeta;
    steps: string[];
}>;

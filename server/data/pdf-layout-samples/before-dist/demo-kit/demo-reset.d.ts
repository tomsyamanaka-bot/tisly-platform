import { ensureDemoCustomerPack } from "./demo-customer-pack.js";
import { seedDemoTimeline30Days } from "./demo-timeline-generator.js";
import { ensureDemoFloorMapsForAllCustomers } from "./demo-floor-maps.js";
import { seedDemoKpiProjects } from "./demo-kpi-seed.js";
export interface DemoResetResult {
    ok: boolean;
    customers: ReturnType<typeof ensureDemoCustomerPack>;
    timeline: ReturnType<typeof seedDemoTimeline30Days>;
    floorMaps: ReturnType<typeof ensureDemoFloorMapsForAllCustomers>;
    kpi: ReturnType<typeof seedDemoKpiProjects>;
    at: string;
}
export declare function clearDemoKitData(): void;
/** デモデータを削除して再生成（営業前ワンクリックリセット） */
export declare function resetDemoKit(): DemoResetResult;
/** 起動時 idempotent シード（フルリセットは POST /api/demo-kit/reset のみ） */
export declare function ensureDemoKit(): DemoResetResult;

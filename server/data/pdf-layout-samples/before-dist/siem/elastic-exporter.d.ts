import type { SiemEvent } from "../security/siem-exporter.js";
export declare function exportToElastic(event: SiemEvent, url: string, index?: string): Promise<boolean>;

import type { SiemEvent } from "../security/siem-exporter.js";
export declare function exportToLoki(event: SiemEvent, url: string): Promise<boolean>;

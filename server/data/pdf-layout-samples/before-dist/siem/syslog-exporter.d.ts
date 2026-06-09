import type { SiemEvent } from "../security/siem-exporter.js";
export declare function exportToSyslog(event: SiemEvent, host: string, port: number): Promise<boolean>;

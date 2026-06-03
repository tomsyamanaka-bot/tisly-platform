import dgram from "dgram";
import type { SiemEvent } from "../security/siem-exporter.js";

export function exportToSyslog(
  event: SiemEvent,
  host: string,
  port: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const client = dgram.createSocket("udp4");
    const pri = event.severity === "critical" ? 131 : event.severity === "high" ? 130 : 13;
    const msg = `<${pri}>1 ${event.timestamp} tisly - - - ${JSON.stringify(event)}`;
    client.send(msg, port, host, (err) => {
      client.close();
      resolve(!err);
    });
  });
}

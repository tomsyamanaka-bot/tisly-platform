import dgram from "dgram";
export function exportToSyslog(event, host, port) {
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

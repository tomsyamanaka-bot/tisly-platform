export async function exportToLoki(event, url) {
    const stream = {
        streams: [
            {
                stream: {
                    job: "tisly",
                    action: event.action,
                    severity: event.severity,
                },
                values: [[`${Date.now() * 1_000_000}`, JSON.stringify(event)]],
            },
        ],
    };
    const res = await fetch(`${url.replace(/\/$/, "")}/loki/api/v1/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stream),
    });
    return res.ok;
}

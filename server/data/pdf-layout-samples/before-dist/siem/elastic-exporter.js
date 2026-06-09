export async function exportToElastic(event, url, index = "tisly-security") {
    const base = url.replace(/\/$/, "");
    const res = await fetch(`${base}/${index}/_doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            "@timestamp": event.timestamp,
            ...event,
        }),
    });
    return res.ok;
}

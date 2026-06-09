/** AI Analytics — event classification for risk scoring */
const CATEGORY_MAP = {
    intrusion: "intrusion",
    perimeter: "perimeter",
    window_open: "access",
    door_open: "access",
    motion: "access",
    temperature_high: "environment",
    estop: "safety",
    heartbeat: "connectivity",
    heartbeat_alarm: "connectivity",
    heartbeat_warning: "connectivity",
    recovery: "recovery",
    camera_motion: "camera",
};
export function classifyEventCategory(eventType) {
    return CATEGORY_MAP[eventType] ?? "other";
}
export function isNightHour(date = new Date()) {
    const h = date.getHours();
    return h >= 23 || h < 3;
}
export function classifyEvent(eventType, createdAt, concurrentCount = 0) {
    const category = classifyEventCategory(eventType);
    const at = createdAt ? new Date(createdAt) : new Date();
    const night = isNightHour(at);
    const concurrent = concurrentCount >= 2;
    let baseRisk = 5;
    if (eventType === "window_open")
        baseRisk = 10;
    else if (eventType === "motion" || eventType === "door_open")
        baseRisk = 15;
    else if (eventType === "intrusion" && night)
        baseRisk = 70;
    else if (eventType === "intrusion")
        baseRisk = 50;
    else if (eventType === "perimeter")
        baseRisk = 45;
    else if (eventType === "estop")
        baseRisk = 90;
    else if (eventType === "temperature_high")
        baseRisk = 25;
    else if (eventType === "heartbeat_alarm")
        baseRisk = 40;
    if (concurrent)
        baseRisk = Math.min(100, baseRisk + 25);
    return { eventType, category, isNightTime: night, isConcurrent: concurrent, baseRisk };
}

export const OPEN_INCIDENT_STATUSES = ["open", "acknowledged", "escalated"];
export function isOpenStatus(status) {
    return OPEN_INCIDENT_STATUSES.includes(status);
}
export function canTransition(from, to) {
    if (from === to)
        return true;
    if (from === "closed" || from === "resolved")
        return false;
    if (to === "closed" || to === "resolved")
        return true;
    if (to === "escalated")
        return from === "open" || from === "acknowledged";
    if (to === "acknowledged")
        return from === "open";
    return true;
}

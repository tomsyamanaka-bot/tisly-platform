/** 30秒 → 5分 → 30分 で通知先を変更 */
export const DEFAULT_ESCALATION = [
    { tier: "L1", afterSec: 30, channels: ["web_push"], label: "初動（30秒）" },
    { tier: "L2", afterSec: 300, channels: ["web_push", "discord"], label: "5分エスカレーション" },
    {
        tier: "L3",
        afterSec: 1800,
        channels: ["web_push", "discord", "email"],
        label: "30分 — 管理者全チャネル",
    },
];
export function tierForElapsed(elapsedSec) {
    let current = DEFAULT_ESCALATION[0];
    for (const s of DEFAULT_ESCALATION) {
        if (elapsedSec >= s.afterSec)
            current = s;
    }
    return current;
}

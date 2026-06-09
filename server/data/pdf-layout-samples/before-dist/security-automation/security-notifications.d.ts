export type SecurityNotificationKind = "security_armed" | "security_disarmed" | "auto_arm_failed" | "auto_arm_skipped" | "auto_disarm_skipped" | "switchbot_status_failed" | "switchbot_locked" | "switchbot_unlocked" | "unknown_device_blocked" | "real_command_rejected" | "switchbot_api_error" | "switchbot_token_error" | "child_arrived_home" | "child_left_home" | "guest_unlock" | "unknown_unlock";
export interface SecurityNotificationCandidate {
    id: string;
    kind: SecurityNotificationKind;
    title: string;
    body: string;
    href: string;
}
/** WebPush / Discord / mail mock に配信（失敗は握りつぶし） */
export declare function dispatchSecurityEventNotification(kind: SecurityNotificationKind, body: string): Promise<void>;
export declare function resetSecurityNotificationDispatchForTests(): void;
export declare function collectSecurityNotificationCandidates(): SecurityNotificationCandidate[];

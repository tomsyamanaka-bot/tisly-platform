/**
 * Phase 1361–1380 — Family presence automation & child arrival notifications
 */
import { listChildArrivalNotifications, listFamilyNotifications, listPresenceUsers } from "../lock-provider/lock-provider-store.js";
import type { LockEvent } from "../providers/lock/types.js";
export { listPresenceUsers, listFamilyNotifications, listChildArrivalNotifications };
export declare function processFamilyUnlockEvent(event: LockEvent): void;
export declare function getFamilyPresenceOverview(): {
    presenceUsers: import("../providers/lock/types.js").PresenceUser[];
    presenceSummary: import("../security-automation/security-automation-types.js").PresenceSummary;
    recentNotifications: import("../providers/lock/types.js").FamilyNotificationRecord[];
    childArrivals: import("../providers/lock/types.js").FamilyNotificationRecord[];
    rules: {
        lockAndAllAway: string;
        unlock: string;
        childUnlock: string;
    };
};

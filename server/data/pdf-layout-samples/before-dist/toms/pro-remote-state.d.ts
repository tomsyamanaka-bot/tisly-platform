export type ProRemoteWsAction = "floor_nav" | "pin_select" | "ack" | "close" | "escalate";
export interface ProRemoteStateSnapshot {
    projectId: string;
    lastAction: ProRemoteWsAction;
    tier?: string;
    pinId?: string;
    notificationId?: string;
    actor: string;
    at: string;
}
export declare function recordProRemoteState(input: {
    projectId: string;
    action: ProRemoteWsAction;
    tier?: string;
    pinId?: string;
    notificationId?: string;
    actor: string;
}): ProRemoteStateSnapshot;
export declare function getProRemoteState(projectId: string): ProRemoteStateSnapshot | null;
export declare function listProOperations(projectId: string, limit?: number): any;

export interface PlaybookStep {
    order: number;
    action: string;
    responsible: string;
}
export interface RecoveryPlaybook {
    eventType: string;
    title: string;
    steps: PlaybookStep[];
}
export declare const RECOVERY_PLAYBOOKS: RecoveryPlaybook[];
export declare function getPlaybook(eventType: string): RecoveryPlaybook | undefined;

export type InfraStatus = "GREEN" | "YELLOW" | "RED";
export interface InfraComponentStatus {
    name: string;
    status: InfraStatus;
    detail: string;
}
export declare function getInfrastructureStatuses(): Promise<InfraComponentStatus[]>;

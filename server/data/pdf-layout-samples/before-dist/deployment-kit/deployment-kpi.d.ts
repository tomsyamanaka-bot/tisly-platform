export interface DeploymentKpi {
    customerCount: number;
    siteCount: number;
    deviceCount: number;
    maintenanceCount: number;
    monthlyContractCount: number;
    deploymentCompleteCount: number;
    assetQrCount: number;
    phase: string;
}
export declare function buildDeploymentKpi(): DeploymentKpi;

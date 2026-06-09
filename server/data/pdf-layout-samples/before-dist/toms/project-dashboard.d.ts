import { getBusinessProject, getCompletionReport, getCustomer, getEstimate, getInvoice } from "../business/business-store.js";
import { listProjectTimeline } from "./project-timeline.js";
import { listWorkflowHistory } from "./workflow-engine.js";
import { listProjectAssets } from "./asset-master.js";
import { buildProjectFloorStack } from "./floor-stack-project.js";
import { listProjectLiveDevices } from "./realtime-devices.js";
import { listProjectNotifications } from "./project-notifications.js";
import { listProjectMaintenance } from "./maintenance-flow.js";
import { compareDrawingVersions } from "./drawing-diff.js";
export interface ProjectDashboardPayload {
    project: ReturnType<typeof getBusinessProject>;
    tomsState: string;
    customer: ReturnType<typeof getCustomer> | null;
    gps: {
        lat: number | null;
        lng: number | null;
    };
    photos: {
        survey: unknown[];
        construction: unknown[];
        classified: unknown[];
    };
    drawings: {
        plans: unknown[];
        versions: unknown[];
    };
    floorStack: ReturnType<typeof buildProjectFloorStack>;
    liveDevices: ReturnType<typeof listProjectLiveDevices>;
    estimate: ReturnType<typeof getEstimate> | null;
    invoice: ReturnType<typeof getInvoice> | null;
    payments: Array<{
        amount: number;
        date: string;
        method: string;
    }>;
    completionReport: ReturnType<typeof getCompletionReport> | null;
    constructionHistory: Array<{
        status: string;
        updatedAt: string;
    }>;
    maintenance: ReturnType<typeof listProjectMaintenance>;
    notifications: ReturnType<typeof listProjectNotifications>;
    proRemote: {
        status: string;
        href: string;
    };
    logs: unknown[];
    timeline: ReturnType<typeof listProjectTimeline>;
    workflowHistory: ReturnType<typeof listWorkflowHistory>;
    assets: ReturnType<typeof listProjectAssets>;
    drawingDiff: ReturnType<typeof compareDrawingVersions>;
    links: {
        business: string;
        survey: string | null;
        drawing: string;
        proRemote: string;
    };
}
export declare function buildProjectDashboard(projectId: string): ProjectDashboardPayload | null;

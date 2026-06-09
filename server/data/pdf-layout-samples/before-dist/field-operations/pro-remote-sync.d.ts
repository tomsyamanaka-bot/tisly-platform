export declare function syncProRemoteFromBusinessProject(projectId: string): {
    phase: string;
    projectId: string;
    surveyProjectId: string;
    customerCode: string;
    tiers: string[];
    layers: {
        layerId: string;
        tier: string;
        displayName: string;
        imageUrl: string | null;
    }[];
    roofCreated: boolean;
};

/** Never creates roof/屋上 — only 外周 / 1F / 2F. */
export declare function generateFloorMapFromSurvey(projectId: string): {
    customerCode: string;
    tiers: string[];
    layers: Array<{
        layerId: string;
        tier: string;
        displayName: string;
        imageUrl: string | null;
    }>;
    roofCreated: false;
};
export declare function getSurveyProMapLink(projectId: string): {
    linked: boolean;
    customerCode: string | null;
};

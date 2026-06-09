export interface ProRemoteFieldMediaItem {
    url: string;
    source: "survey" | "install" | "drawing";
    label: string;
    photoType?: string;
}
export declare function buildFieldMediaByTier(customerCode: string): Record<string, ProRemoteFieldMediaItem[]>;

export type RetentionDays = 30 | 90 | 365;
export declare function getRetentionPolicy(): {
    days: RetentionDays;
    options: RetentionDays[];
    archiveDir: string;
};
export declare function purgeArchives(opts: {
    retentionDays: RetentionDays;
    dryRun: boolean;
}): {
    retentionDays: number;
    dryRun: boolean;
    candidates: number;
    deleted: number;
    freedBytes: number;
    files: string[];
};

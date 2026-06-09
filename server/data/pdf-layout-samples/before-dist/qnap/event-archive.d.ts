export type ExportFormat = "json" | "csv";
export declare function archiveEventsToFile(format?: ExportFormat, days?: number): string;
export declare function listArchives(): Array<{
    id: string;
    archiveType: string;
    format: string;
    filePath: string;
    recordCount: number;
    createdAt: string;
}>;
/** H.View / Reolink カメラアーカイブ設計（将来実装） */
export declare const CAMERA_ARCHIVE_DESIGN: {
    providers: string[];
    storage: string;
    retentionDays: number;
    formats: string[];
    status: string;
    qnapPath: string;
};
export declare function getQnapStatus(): {
    connected: boolean;
    host: any;
    archiveDir: any;
    publicUrl: string;
    cameraArchive: {
        providers: string[];
        storage: string;
        retentionDays: number;
        formats: string[];
        status: string;
        qnapPath: string;
    };
    message: string;
};

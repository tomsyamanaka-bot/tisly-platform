export declare function pdfSnapshotPath(name: string): string;
export declare function hashBuffer(buf: Buffer): string;
export declare function comparePdfSnapshot(name: string, buf: Buffer, threshold?: number): {
    match: boolean;
    diffRatio: number;
};
export declare function comparePdfPixels(name: string, pngA: Buffer, pngB: Buffer, threshold?: number): Promise<{
    match: boolean;
    diffRatio: number;
    usedPixelmatch: boolean;
}>;

export interface FloorplanArchiveResult {
    ok: boolean;
    mock: boolean;
    archivePath: string;
    message: string;
}
export declare function archiveFloorplanToQnap(input: {
    customerId: string;
    customerCode: string;
    floorId: string;
    actorId?: string;
}): FloorplanArchiveResult;

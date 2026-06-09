export declare function setTvFocusState(input: {
    customerCode: string;
    cameraId: string;
    floor?: string;
    trigger?: string;
}): void;
export declare function getTvFocusState(customerCode: string): {
    customerCode: string;
    focusCamera: {
        active: boolean;
        cameraId: string | null;
        floor: string;
        viewLabel: string;
        trigger: string;
        startedAt: string | null;
        expiresAt: string | null;
        remainingSec: number;
    };
    fixedViews: string[];
};
export declare function clearTvFocusState(customerCode: string): void;

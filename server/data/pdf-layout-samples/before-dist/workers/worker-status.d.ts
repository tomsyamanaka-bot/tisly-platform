export declare function recordWorkerTick(result: Record<string, unknown>): void;
export declare function setWorkerRunning(running: boolean): void;
export declare function getWorkerStatus(): {
    running: boolean;
    lastTickAt: string | null;
    lastTickResult: Record<string, unknown> | null;
    queues: {
        notification: number;
        webhook: number;
        reportEmail: number;
    };
    billing: {
        configured: boolean;
        mockMode: boolean;
        publicUrl: string;
    };
    stripeConfigured: boolean;
    smtpConfigured: boolean;
    puppeteerEnabled: boolean;
    pdfFallback: string;
};

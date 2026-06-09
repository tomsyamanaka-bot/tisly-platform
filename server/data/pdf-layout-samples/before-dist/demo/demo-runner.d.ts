export declare function isDemoRunnerActive(): boolean;
export declare function getDemoRunnerStats(): {
    active: boolean;
    intervalSec: number;
    tickCount: number;
    deviceCount: number;
};
export declare function startDemoRunner(): Promise<void>;
export declare function stopDemoRunner(): void;

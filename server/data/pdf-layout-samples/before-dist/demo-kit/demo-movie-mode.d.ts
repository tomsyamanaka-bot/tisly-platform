export type DemoMovieScene = "notify" | "intrusion" | "recovery" | "maintenance";
export declare function getDemoMovieStatus(): {
    running: boolean;
    customerCode: string;
    currentScene: DemoMovieScene | null;
    step: number;
    totalSteps: number;
    scenes: DemoMovieScene[];
};
export declare function stopDemoMovie(): void;
export declare function startDemoMovie(customerCode?: string, intervalMs?: number): {
    ok: boolean;
    intervalMs: number;
};

export type SalesWsEventKind = "status" | "notification" | "intrusion" | "recovery" | "maintenance" | "roi" | "device_mode" | "reset";
export declare function broadcastSalesDemoEvent(kind: SalesWsEventKind, payload?: Record<string, unknown>): void;
export declare function getSalesLiveBadge(): "live" | "mock" | "offline";
export declare function getSalesShellyEnvBadge(): "real" | "mock";

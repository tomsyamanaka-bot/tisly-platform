export interface SecurityDemoInputConfig {
    label: string;
    eventType: string;
    notifyTitleOn: string;
    notifyBodyOn: string;
    notifyTitleOff: string;
    notifyBodyOff: string;
}
export interface SecurityDemoConfig {
    deviceId: string;
    deviceName: string;
    inputs: Record<string, SecurityDemoInputConfig>;
    armNotify: {
        title: string;
        body: string;
    };
    disarmNotify: {
        title: string;
        body: string;
    };
}
export declare function loadSecurityDemoConfig(): SecurityDemoConfig;
export declare function resetSecurityDemoConfigCache(): void;
export declare function getInputConfig(di: number): SecurityDemoInputConfig;
export declare function buildInputNotifyPayload(di: number, to: "on" | "off"): {
    title: string;
    body: string;
    eventType: string;
    deviceId: string;
    url: string;
    data: {
        kind: string;
        input: number;
        from: string;
        to: "on" | "off";
        eventType: string;
        label: string;
    };
};

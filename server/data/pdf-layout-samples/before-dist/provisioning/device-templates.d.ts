export interface DeviceTemplate {
    id: string;
    name: string;
    deviceType: string;
    platform: string;
    iconType: string;
    defaultMqttTopic: string;
    description: string;
}
export declare const DEVICE_TEMPLATES: DeviceTemplate[];
export declare function listDeviceTemplates(): DeviceTemplate[];
export declare function getDeviceTemplate(id: string): DeviceTemplate | undefined;

import type { DeliveryResult, NotificationChannel, TislyEvent } from "./types.js";
interface ChannelFlags {
    push?: boolean;
    discord?: boolean;
    email?: boolean;
}
export declare class NotificationService {
    private mqttClient;
    start(): void;
    stop(): void;
    private connectMqtt;
    processEvent(event: TislyEvent, channels?: ChannelFlags): Promise<string>;
    private getEnabledChannels;
    private logDelivery;
    sendTest(channel: NotificationChannel): Promise<DeliveryResult>;
}
export declare function getNotificationService(): NotificationService;
export {};

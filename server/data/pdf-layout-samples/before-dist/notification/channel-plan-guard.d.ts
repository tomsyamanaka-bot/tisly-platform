import type { Response } from "express";
import type { CustomerPlan } from "../customer/types.js";
export type NotificationChannelKind = "email" | "web_push" | "discord" | "webhook" | "qnap_archive";
export declare function planAllowsChannel(plan: CustomerPlan, channel: NotificationChannelKind): boolean;
export declare function requireNotificationChannel(plan: CustomerPlan, channel: NotificationChannelKind, res: Response): boolean;
export declare function listAllowedChannels(plan: CustomerPlan): NotificationChannelKind[];

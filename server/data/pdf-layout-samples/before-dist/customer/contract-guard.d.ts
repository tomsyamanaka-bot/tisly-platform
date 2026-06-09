import type { Response } from "express";
import type { CustomerRow } from "./types.js";
export type ContractStatus = "trial" | "active" | "suspended" | "cancelled";
export declare function getContractStatus(customer: CustomerRow): ContractStatus;
export declare function isContractRestricted(contract: ContractStatus): boolean;
export declare function notificationsAllowedForContract(contract: ContractStatus): boolean;
export declare function requireActiveContract(customer: CustomerRow, res: Response, mode?: "write" | "portal"): boolean;
export declare function contractWarningBanner(customer: CustomerRow): string | null;

import type { Response } from "express";
import type { CustomerRow } from "./types.js";
import { getDatabase } from "../db/database.js";

export type ContractStatus = "trial" | "active" | "suspended" | "cancelled";

export function getContractStatus(customer: CustomerRow): ContractStatus {
  const row = getDatabase()
    .prepare(`SELECT contract_status FROM customers WHERE customer_id = ?`)
    .get(customer.customer_id) as { contract_status: string | null } | undefined;
  const s = row?.contract_status ?? "active";
  if (s === "trial" || s === "active" || s === "suspended" || s === "cancelled") {
    return s;
  }
  return "active";
}

export function isContractRestricted(contract: ContractStatus): boolean {
  return contract === "suspended" || contract === "cancelled";
}

export function notificationsAllowedForContract(contract: ContractStatus): boolean {
  return contract === "trial" || contract === "active";
}

export function requireActiveContract(
  customer: CustomerRow,
  res: Response,
  mode: "write" | "portal" = "write"
): boolean {
  const contract = getContractStatus(customer);
  if (!isContractRestricted(contract)) return true;
  const message =
    contract === "cancelled"
      ? "契約は解約済みです。閲覧のみ可能です。"
      : "契約は一時停止中です。管理者にお問い合わせください。";
  res.status(403).json({
    error: "Contract restriction",
    contractStatus: contract,
    mode,
    hint: message,
    adminWarning: `Customer ${customer.customer_code} is ${contract}`,
  });
  return false;
}

export function contractWarningBanner(customer: CustomerRow): string | null {
  const contract = getContractStatus(customer);
  if (contract === "suspended") {
    return "契約が一時停止中です。一部機能が制限されています。";
  }
  if (contract === "cancelled") {
    return "契約は解約済みです。閲覧のみ可能です。";
  }
  return null;
}

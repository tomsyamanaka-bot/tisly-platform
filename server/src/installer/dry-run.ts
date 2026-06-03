import type { Request } from "express";

export function isDryRunRequest(req: Request): boolean {
  const header = req.header("x-tisly-dry-run");
  if (header === "1" || header?.toLowerCase() === "true") return true;
  const q = req.query.dryRun;
  if (q === "1" || q === "true") return true;
  const body = req.body as { dryRun?: boolean };
  return body?.dryRun === true;
}

export interface DryRunLogEntry {
  action: string;
  at: string;
  body?: Record<string, unknown>;
}

const dryRunLogs = new Map<string, DryRunLogEntry[]>();

export function logDryRun(customerCode: string, action: string, body?: Record<string, unknown>): void {
  const key = customerCode.toUpperCase();
  const list = dryRunLogs.get(key) ?? [];
  list.push({ action, at: new Date().toISOString(), body });
  if (list.length > 500) list.shift();
  dryRunLogs.set(key, list);
}

export function getDryRunLogs(customerCode: string): DryRunLogEntry[] {
  return [...(dryRunLogs.get(customerCode.toUpperCase()) ?? [])];
}

export function clearDryRunLogsForTests(): void {
  dryRunLogs.clear();
}

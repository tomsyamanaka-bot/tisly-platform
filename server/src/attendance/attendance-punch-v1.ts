/**
 * TiSLY 勤怠・入退室打刻 v1
 * NFC/RS485 シミュレーション + リレー CH1 解錠ログ
 */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

export type AttendancePunchTypeV1 = "clock_in" | "clock_out";

export type AttendanceRelayUnlockStatusV1 = "success" | "failed";

export interface AttendanceRelayUnlockV1 {
  channel: "CH1";
  status: AttendanceRelayUnlockStatusV1;
  durationMs: number;
  message: string;
}

export interface AttendancePunchLogV1 {
  id: string;
  customerCode: string;
  employeeName: string;
  punchType: AttendancePunchTypeV1;
  punchedAt: string;
  nfcSource: "rs485_sim" | "pn532_sim";
  relayUnlock: AttendanceRelayUnlockV1;
}

function getStorePath(): string {
  const dir = process.env.ATTENDANCE_PUNCH_DATA_DIR
    ? path.resolve(process.env.ATTENDANCE_PUNCH_DATA_DIR)
    : path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "attendance-punch-logs-v1.json");
}

function readAllLogs(): AttendancePunchLogV1[] {
  const filePath = getStorePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as AttendancePunchLogV1[];
  } catch {
    return [];
  }
}

function writeAllLogs(logs: AttendancePunchLogV1[]): void {
  const filePath = getStorePath();
  fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), "utf8");
}

function simulateRelayUnlock(
  punchType: AttendancePunchTypeV1
): AttendanceRelayUnlockV1 {
  const label = punchType === "clock_in" ? "出勤" : "退勤";
  return {
    channel: "CH1",
    status: "success",
    durationMs: 1000,
    message: `${label}打刻連動 · RO1 1秒パルス · 解錠OK`,
  };
}

/** テナント別ログ一覧（新しい順） */
export function listAttendancePunchLogsV1(input: {
  customerCode: string;
  limit?: number;
}): AttendancePunchLogV1[] {
  const code = input.customerCode.toUpperCase();
  const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 200);
  return readAllLogs()
    .filter((row) => row.customerCode.toUpperCase() === code)
    .sort(
      (a, b) =>
        new Date(b.punchedAt).getTime() - new Date(a.punchedAt).getTime()
    )
    .slice(0, limit);
}

/** 打刻を記録しリレー解錠ステータスを返す */
export function recordAttendancePunchV1(input: {
  customerCode: string;
  employeeName: string;
  punchType: AttendancePunchTypeV1;
  nfcSource?: "rs485_sim" | "pn532_sim";
}): AttendancePunchLogV1 {
  const customerCode = input.customerCode.toUpperCase();
  const employeeName = String(input.employeeName ?? "").trim() || "現場スタッフ";
  const punchType = input.punchType;
  const nfcSource = input.nfcSource ?? "rs485_sim";
  const relayUnlock = simulateRelayUnlock(punchType);

  const log: AttendancePunchLogV1 = {
    id: uuid(),
    customerCode,
    employeeName,
    punchType,
    punchedAt: new Date().toISOString(),
    nfcSource,
    relayUnlock,
  };

  const logs = readAllLogs();
  logs.push(log);
  writeAllLogs(logs);
  return log;
}

/** テスト用 — ストアを空にする */
export function resetAttendancePunchLogsForTestV1(): void {
  const filePath = getStorePath();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

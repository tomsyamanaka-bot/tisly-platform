/**
 * TiSLY 勤怠・入退室打刻 API v1
 * GET  /api/attendance/v1/logs
 * POST /api/attendance/v1/punch
 */

import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import {
  listAttendancePunchLogsV1,
  recordAttendancePunchV1,
  type AttendancePunchTypeV1,
} from "../../attendance/attendance-punch-v1.js";

export const attendanceRouter = Router();

const auth = [requireAuth("viewer")] as const;

function customerCode(req: AuthedRequest): string {
  return (req.admin?.customerCode ?? "TOMS001").toUpperCase();
}

function parsePunchType(value: unknown): AttendancePunchTypeV1 | null {
  if (value === "clock_in" || value === "clock_out") return value;
  return null;
}

attendanceRouter.get("/logs", ...auth, (req: AuthedRequest, res: Response) => {
  const limit = Number(req.query.limit ?? 50);
  const logs = listAttendancePunchLogsV1({
    customerCode: customerCode(req),
    limit,
  });
  res.json({ ok: true, count: logs.length, logs });
});

attendanceRouter.post("/punch", ...auth, (req: AuthedRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const punchType = parsePunchType(body.punchType ?? body.type);
  if (!punchType) {
    res.status(400).json({
      error: "punchType must be clock_in or clock_out",
    });
    return;
  }

  const employeeName =
    body.employeeName != null
      ? String(body.employeeName)
      : req.admin?.username ?? "現場スタッフ";

  const log = recordAttendancePunchV1({
    customerCode: customerCode(req),
    employeeName,
    punchType,
    nfcSource:
      body.nfcSource === "pn532_sim" ? "pn532_sim" : "rs485_sim",
  });

  const logs = listAttendancePunchLogsV1({
    customerCode: customerCode(req),
    limit: 50,
  });

  res.json({ ok: true, log, logs });
});

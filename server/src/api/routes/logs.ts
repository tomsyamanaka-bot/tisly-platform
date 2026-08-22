/**
 * TiSLY HOME — 総合システムログ API
 * GET /api/logs
 */

import { Router } from "express";
import {
  formatSystemLogTimeV1,
  listSystemLogsV1,
} from "../../home/home-system-log-v1.js";

export const logsRouter = Router();

/** 全物件の動作ログ・履歴 */
logsRouter.get("/", (req, res) => {
  const siteId = String(req.query.siteId ?? "").trim() || null;
  const category = String(req.query.category ?? "").trim() || null;
  const limit = Number(req.query.limit ?? 50);

  const logs = listSystemLogsV1({ siteId, category, limit }).map((row) => ({
    ...row,
    timeLabel: formatSystemLogTimeV1(row.createdAt),
    displayLine: `[${formatSystemLogTimeV1(row.createdAt)}] ${row.siteName}: ${row.message}`,
  }));

  res.json({
    ok: true,
    siteId,
    category,
    count: logs.length,
    logs,
  });
});

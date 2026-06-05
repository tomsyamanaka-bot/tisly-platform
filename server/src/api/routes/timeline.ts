import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../auth/auth-middleware.js";
import { buildUnifiedTimeline } from "../../timeline/tisly-timeline.js";

export const timelineRouter = Router();

timelineRouter.get("/", requireAuth("viewer"), (req: AuthedRequest, res) => {
  const projectId = req.query.projectId as string | undefined;
  const customerCode = req.query.customerCode as string | undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 200;
  const events = buildUnifiedTimeline({ projectId, customerCode, limit });
  res.json({ phase: "1121-1160", count: events.length, events });
});

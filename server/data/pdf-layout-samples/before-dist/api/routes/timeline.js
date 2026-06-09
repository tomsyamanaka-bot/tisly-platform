import { Router } from "express";
import { requireAuth } from "../../auth/auth-middleware.js";
import { buildUnifiedTimeline } from "../../timeline/tisly-timeline.js";
export const timelineRouter = Router();
timelineRouter.get("/", requireAuth("viewer"), (req, res) => {
    const projectId = req.query.projectId;
    const customerCode = req.query.customerCode;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const events = buildUnifiedTimeline({ projectId, customerCode, limit });
    res.json({ phase: "1121-1160", count: events.length, events });
});

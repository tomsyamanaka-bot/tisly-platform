import type { NextFunction, Request, Response } from "express";
import {
  isReplayAsync,
  recordReplayAsync,
  recordReplayBlocked,
} from "./replay-protection.js";

export interface ReplayRequest extends Request {
  rawBody?: string;
}

export function requireReplayProtection(
  req: ReplayRequest,
  res: Response,
  next: NextFunction
): void {
  const signature = req.header("x-tisly-signature");
  const eventId =
    (req.body?.event_id as string | undefined) ??
    (req.body?.eventId as string | undefined);
  const timestamp = req.header("x-tisly-timestamp");

  if (!signature) {
    next();
    return;
  }

  void (async () => {
    if (await isReplayAsync(signature, eventId, timestamp ?? undefined)) {
      recordReplayBlocked();
      res.status(409).json({ error: "Replay detected", replay: true });
      return;
    }
    await recordReplayAsync(signature, eventId, timestamp ?? undefined);
    next();
  })();
}

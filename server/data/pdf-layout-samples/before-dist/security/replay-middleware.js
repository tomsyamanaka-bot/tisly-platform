import { isReplayAsync, recordReplayAsync, recordReplayBlocked, } from "./replay-protection.js";
export function requireReplayProtection(req, res, next) {
    const signature = req.header("x-tisly-signature");
    const eventId = req.body?.event_id ??
        req.body?.eventId;
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

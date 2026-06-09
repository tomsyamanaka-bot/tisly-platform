import { processGmailQueueBatch } from "../business/gmail-send-queue.js";
export async function runGmailOAuthRetryWorkerTick() {
    const result = processGmailQueueBatch(8);
    return { worker: "gmail-oauth-retry", ...result };
}

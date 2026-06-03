import { processGmailQueueBatch } from "../business/gmail-send-queue.js";

export async function runGmailOAuthRetryWorkerTick(): Promise<Record<string, unknown>> {
  const result = processGmailQueueBatch(8);
  return { worker: "gmail-oauth-retry", ...result };
}

import {
  listKnowledgeQnapSyncQueueV1,
} from "../knowledge/knowledge-qnap-sync-store-v1.js";
import { processKnowledgeQnapSyncItemV1 } from "../knowledge/knowledge-qnap-sync-service-v1.js";

const MAX_PER_TICK = Number(process.env.KNOWLEDGE_QNAP_SYNC_BATCH ?? "5");

export async function runKnowledgeQnapSyncWorkerTick(): Promise<{
  worker: string;
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const queue = listKnowledgeQnapSyncQueueV1(MAX_PER_TICK);
  let succeeded = 0;
  let failed = 0;
  for (const row of queue) {
    const ok = await processKnowledgeQnapSyncItemV1(row);
    if (ok) succeeded += 1;
    else failed += 1;
  }
  return {
    worker: "knowledge-qnap-sync",
    processed: queue.length,
    succeeded,
    failed,
  };
}

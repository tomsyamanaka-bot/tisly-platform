import { listQnapBackupQueue } from "../projects/project-pdf-qnap-store.js";
import { processQnapPdfBackupRow } from "../storage/qnap-pdf-backup-service.js";

const MAX_PER_TICK = Number(process.env.QNAP_PDF_BACKUP_BATCH ?? "5");

export async function runQnapPdfBackupWorkerTick(): Promise<{
  worker: string;
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const queue = listQnapBackupQueue(MAX_PER_TICK);
  let succeeded = 0;
  let failed = 0;
  for (const row of queue) {
    const ok = await processQnapPdfBackupRow(row);
    if (ok) succeeded += 1;
    else failed += 1;
  }
  return {
    worker: "qnap-pdf-backup",
    processed: queue.length,
    succeeded,
    failed,
  };
}

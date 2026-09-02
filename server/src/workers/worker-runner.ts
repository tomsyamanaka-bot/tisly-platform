import { runNotificationWorkerTick } from "./notification-worker.js";
import { runGmailOAuthRetryWorkerTick } from "./gmail-oauth-retry-worker.js";
import { runQnapPdfBackupWorkerTick } from "./qnap-pdf-backup-worker.js";
import { runKnowledgeQnapSyncWorkerTick } from "./knowledge-qnap-sync-worker-v1.js";
import { runEstimateInvoiceQnapPendingWorkerTick } from "./estimate-invoice-qnap-pending-worker.js";
import { runHomeBathWorkerTickV1 } from "../home/home-bath-worker-v1.js";
import { runToyoshimaHeartbeatWatchdogV1 } from "../home/home-toyoshima-security-v1.js";
import { recordWorkerTick, setWorkerRunning } from "./worker-status.js";

const DEFAULT_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? "15000");
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startWorkers(): void {
  if (intervalHandle) return;
  if (process.env.WORKERS_ENABLED === "false") {
    console.log("[TiSLY] Workers disabled (WORKERS_ENABLED=false)");
    return;
  }
  setWorkerRunning(true);
  const tick = async () => {
    try {
      const notification = await runNotificationWorkerTick();
      const gmail = await runGmailOAuthRetryWorkerTick();
      const qnapPdf = await runQnapPdfBackupWorkerTick();
      const knowledgeQnap = await runKnowledgeQnapSyncWorkerTick();
      const estimateInvoicePending =
        await runEstimateInvoiceQnapPendingWorkerTick();
      const homeBath = runHomeBathWorkerTickV1();
      await runToyoshimaHeartbeatWatchdogV1();
      recordWorkerTick({
        notification,
        gmail,
        qnapPdf,
        knowledgeQnap,
        estimateInvoicePending,
        homeBath,
      } as unknown as Record<string, unknown>);
    } catch (e) {
      recordWorkerTick({ error: e instanceof Error ? e.message : String(e) });
    }
  };
  void tick();
  intervalHandle = setInterval(() => void tick(), DEFAULT_INTERVAL_MS);
  console.log(`[TiSLY] Workers started (interval ${DEFAULT_INTERVAL_MS}ms)`);
}

export function stopWorkers(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  setWorkerRunning(false);
}

/**
 * 見積・請求 PDF — QNAP 一時保存キューの自動再送 Worker
 */
import {
  listEstimateInvoiceQnapPendingV1,
  markEstimateInvoiceQnapPendingV1,
} from "../storage/estimate-invoice-qnap-pending-store-v1.js";
import { retryPendingEstimateInvoiceUploadV1 } from "../storage/estimate-invoice-qnap-save-v1.js";

const MAX_PER_TICK = Number(
  process.env.QNAP_ESTIMATE_INVOICE_PENDING_BATCH ?? "3"
);

export async function runEstimateInvoiceQnapPendingWorkerTick(): Promise<{
  worker: string;
  processed: number;
  succeeded: number;
  failed: number;
  deferred: number;
}> {
  const queue = listEstimateInvoiceQnapPendingV1(MAX_PER_TICK);
  let succeeded = 0;
  let failed = 0;
  let deferred = 0;

  for (const item of queue) {
    markEstimateInvoiceQnapPendingV1(item.id, {
      status: "uploading",
      attempts: item.attempts + 1,
    });
    try {
      const result = await retryPendingEstimateInvoiceUploadV1({
        projectId: item.projectId,
        files: item.files,
      });
      if (result.remoteOk) {
        markEstimateInvoiceQnapPendingV1(item.id, {
          status: "success",
          lastError: null,
        });
        succeeded += 1;
        console.log(
          `[QNAP pending worker] synced project=${item.projectId}`
        );
      } else {
        markEstimateInvoiceQnapPendingV1(item.id, {
          status: "pending",
          lastError: result.error || result.message,
        });
        deferred += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      markEstimateInvoiceQnapPendingV1(item.id, {
        status: "failed",
        lastError: msg,
      });
      failed += 1;
    }
  }

  return {
    worker: "estimate-invoice-qnap-pending",
    processed: queue.length,
    succeeded,
    failed,
    deferred,
  };
}

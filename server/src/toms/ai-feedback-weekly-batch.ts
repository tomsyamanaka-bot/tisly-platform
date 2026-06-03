import { getDatabase } from "../db/database.js";

export interface AiFeedbackWeeklySegment {
  customerId: string | null;
  industry: string | null;
  adopted: number;
  revised: number;
  rejected: number;
  total: number;
  topRevisedFields: Array<{ field: string; count: number }>;
  commonRevisionNotes: string[];
}

export interface AiFeedbackWeeklySummary {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  mockAi: boolean;
  totals: { adopted: number; revised: number; rejected: number; total: number };
  byCustomer: AiFeedbackWeeklySegment[];
  byIndustry: AiFeedbackWeeklySegment[];
  topRevisedFieldsGlobal: Array<{ field: string; count: number }>;
}

function weekBounds(ref = new Date()): { start: string; end: string } {
  const d = new Date(ref);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  const start = d.toISOString();
  const end = new Date(d.getTime() + 7 * 86400000).toISOString();
  return { start, end };
}

type FeedbackRow = {
  action: string;
  candidate_json: string;
  notes: string;
  customer_id: string | null;
  industry: string | null;
};

function aggregateSegment(rows: FeedbackRow[]): Omit<AiFeedbackWeeklySegment, "customerId" | "industry"> {
  let adopted = 0;
  let revised = 0;
  let rejected = 0;
  const fieldCounts = new Map<string, number>();
  const notes: string[] = [];

  for (const row of rows) {
    if (row.action === "adopted") adopted += 1;
    else if (row.action === "revised") revised += 1;
    else if (row.action === "rejected") rejected += 1;
    if (row.action !== "revised") continue;
    try {
      const c = JSON.parse(row.candidate_json) as Record<string, unknown>;
      const fields = (c.revisedFields as string[]) ?? (c.changedFields as string[]) ?? [];
      for (const f of fields) fieldCounts.set(f, (fieldCounts.get(f) ?? 0) + 1);
    } catch {
      /* */
    }
    if (row.notes) notes.push(row.notes.slice(0, 120));
  }

  const topRevisedFields = [...fieldCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([field, count]) => ({ field, count }));

  const commonRevisionNotes = [...new Set(notes)].slice(0, 5);

  return {
    adopted,
    revised,
    rejected,
    total: rows.length,
    topRevisedFields,
    commonRevisionNotes,
  };
}

export function runAiFeedbackWeeklyBatch(refDate?: Date): AiFeedbackWeeklySummary {
  const { start, end } = weekBounds(refDate);
  const rows = getDatabase()
    .prepare(
      `SELECT f.action, f.candidate_json, f.notes, p.customer_id,
              json_extract(f.candidate_json, '$.industry') AS industry
       FROM ai_estimate_feedback f
       LEFT JOIN business_projects p ON p.id = f.project_id
       WHERE f.created_at >= ? AND f.created_at < ?`
    )
    .all(start, end) as FeedbackRow[];

  const byCustomerMap = new Map<string, FeedbackRow[]>();
  const byIndustryMap = new Map<string, FeedbackRow[]>();
  const globalFields = new Map<string, number>();

  for (const row of rows) {
    const cid = row.customer_id ?? "_unknown";
    if (!byCustomerMap.has(cid)) byCustomerMap.set(cid, []);
    byCustomerMap.get(cid)!.push(row);

    const ind = row.industry ?? "general";
    if (!byIndustryMap.has(ind)) byIndustryMap.set(ind, []);
    byIndustryMap.get(ind)!.push(row);

    if (row.action === "revised") {
      try {
        const c = JSON.parse(row.candidate_json) as Record<string, unknown>;
        const fields = (c.revisedFields as string[]) ?? [];
        for (const f of fields) globalFields.set(f, (globalFields.get(f) ?? 0) + 1);
      } catch {
        /* */
      }
    }
  }

  const seg = aggregateSegment(rows);
  const byCustomer: AiFeedbackWeeklySegment[] = [...byCustomerMap.entries()].map(
    ([customerId, segRows]) => ({
      customerId: customerId === "_unknown" ? null : customerId,
      industry: null,
      ...aggregateSegment(segRows),
    })
  );

  const byIndustry: AiFeedbackWeeklySegment[] = [...byIndustryMap.entries()].map(
    ([industry, segRows]) => ({
      customerId: null,
      industry,
      ...aggregateSegment(segRows),
    })
  );

  const topRevisedFieldsGlobal = [...globalFields.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([field, count]) => ({ field, count }));

  return {
    weekStart: start,
    weekEnd: end,
    generatedAt: new Date().toISOString(),
    mockAi: process.env.AI_ESTIMATE_PROVIDER !== "openai",
    totals: {
      adopted: seg.adopted,
      revised: seg.revised,
      rejected: seg.rejected,
      total: seg.total,
    },
    byCustomer,
    byIndustry,
    topRevisedFieldsGlobal,
  };
}

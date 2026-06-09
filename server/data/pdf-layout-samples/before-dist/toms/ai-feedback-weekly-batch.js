import { getDatabase } from "../db/database.js";
function weekBounds(ref = new Date()) {
    const d = new Date(ref);
    const day = d.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setUTCDate(d.getUTCDate() - diff);
    d.setUTCHours(0, 0, 0, 0);
    const start = d.toISOString();
    const end = new Date(d.getTime() + 7 * 86400000).toISOString();
    return { start, end };
}
function aggregateSegment(rows) {
    let adopted = 0;
    let revised = 0;
    let rejected = 0;
    const fieldCounts = new Map();
    const notes = [];
    for (const row of rows) {
        if (row.action === "adopted")
            adopted += 1;
        else if (row.action === "revised")
            revised += 1;
        else if (row.action === "rejected")
            rejected += 1;
        if (row.action !== "revised")
            continue;
        try {
            const c = JSON.parse(row.candidate_json);
            const fields = c.revisedFields ?? c.changedFields ?? [];
            for (const f of fields)
                fieldCounts.set(f, (fieldCounts.get(f) ?? 0) + 1);
        }
        catch {
            /* */
        }
        if (row.notes)
            notes.push(row.notes.slice(0, 120));
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
export function runAiFeedbackWeeklyBatch(refDate) {
    const { start, end } = weekBounds(refDate);
    const rows = getDatabase()
        .prepare(`SELECT f.action, f.candidate_json, f.notes, p.customer_id,
              json_extract(f.candidate_json, '$.industry') AS industry
       FROM ai_estimate_feedback f
       LEFT JOIN business_projects p ON p.id = f.project_id
       WHERE f.created_at >= ? AND f.created_at < ?`)
        .all(start, end);
    const byCustomerMap = new Map();
    const byIndustryMap = new Map();
    const globalFields = new Map();
    for (const row of rows) {
        const cid = row.customer_id ?? "_unknown";
        if (!byCustomerMap.has(cid))
            byCustomerMap.set(cid, []);
        byCustomerMap.get(cid).push(row);
        const ind = row.industry ?? "general";
        if (!byIndustryMap.has(ind))
            byIndustryMap.set(ind, []);
        byIndustryMap.get(ind).push(row);
        if (row.action === "revised") {
            try {
                const c = JSON.parse(row.candidate_json);
                const fields = c.revisedFields ?? [];
                for (const f of fields)
                    globalFields.set(f, (globalFields.get(f) ?? 0) + 1);
            }
            catch {
                /* */
            }
        }
    }
    const seg = aggregateSegment(rows);
    const byCustomer = [...byCustomerMap.entries()].map(([customerId, segRows]) => ({
        customerId: customerId === "_unknown" ? null : customerId,
        industry: null,
        ...aggregateSegment(segRows),
    }));
    const byIndustry = [...byIndustryMap.entries()].map(([industry, segRows]) => ({
        customerId: null,
        industry,
        ...aggregateSegment(segRows),
    }));
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

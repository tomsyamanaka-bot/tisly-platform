/** 検索 PWA v1 — 見積番号・請求番号・顧客・電話・住所・担当・案件名・工事場所 */
import { getDatabase } from "../db/database.js";
export function practicalSearchV1(query, limit = 40) {
    const q = query.trim();
    if (!q)
        return [];
    const like = `%${q}%`;
    const hits = [];
    const estimates = getDatabase()
        .prepare(`SELECT e.id, e.estimate_no, e.project_id, p.title, p.customer_name, p.address
       FROM business_estimates e
       JOIN business_projects p ON p.id = e.project_id
       WHERE e.estimate_no LIKE ? OR p.title LIKE ? OR p.customer_name LIKE ? OR p.address LIKE ?
       ORDER BY e.updated_at DESC LIMIT 15`)
        .all(like, like, like, like);
    for (const e of estimates) {
        hits.push({
            kind: "estimate",
            id: String(e.id),
            title: `見積 ${e.estimate_no}`,
            subtitle: `${e.customer_name} · ${e.title}`,
            href: `/estimate-v1?project=${e.project_id}`,
        });
    }
    const invoices = getDatabase()
        .prepare(`SELECT i.id, i.invoice_no, i.project_id, p.title, p.customer_name
       FROM business_invoices i
       JOIN business_projects p ON p.id = i.project_id
       WHERE i.invoice_no LIKE ? OR p.title LIKE ? OR p.customer_name LIKE ?
       LIMIT 10`)
        .all(like, like, like);
    for (const i of invoices) {
        hits.push({
            kind: "invoice",
            id: String(i.id),
            title: `請求 ${i.invoice_no}`,
            subtitle: String(i.title),
            href: `/estimate-v1?project=${i.project_id}`,
        });
    }
    const customers = getDatabase()
        .prepare(`SELECT id, name, company, phone, address FROM toms_customer_master
       WHERE name LIKE ? OR company LIKE ? OR phone LIKE ? OR address LIKE ?
       LIMIT 10`)
        .all(like, like, like, like);
    for (const c of customers) {
        hits.push({
            kind: "customer",
            id: String(c.id),
            title: String(c.name),
            subtitle: [c.company, c.phone, c.address].filter(Boolean).join(" · "),
            href: `/projects-v1`,
        });
    }
    const projects = getDatabase()
        .prepare(`SELECT id, project_no, title, customer_name, address, phone, status
       FROM business_projects
       WHERE project_no LIKE ? OR title LIKE ? OR customer_name LIKE ? OR address LIKE ? OR phone LIKE ?
       ORDER BY updated_at DESC LIMIT 20`)
        .all(like, like, like, like, like);
    for (const p of projects) {
        hits.push({
            kind: "project",
            id: String(p.id),
            title: `${p.project_no} ${p.title}`,
            subtitle: `${p.customer_name} · ${p.address}`,
            href: `/projects-v1?id=${p.id}&source=business`,
        });
    }
    const surveys = getDatabase()
        .prepare(`SELECT project_id, project_no, site_name, customer_name, address, phone, assignee
       FROM survey_projects
       WHERE project_no LIKE ? OR site_name LIKE ? OR customer_name LIKE ? OR address LIKE ? OR phone LIKE ? OR assignee LIKE ?
       ORDER BY updated_at DESC LIMIT 15`)
        .all(like, like, like, like, like, like);
    for (const s of surveys) {
        hits.push({
            kind: "survey",
            id: String(s.project_id),
            title: `${s.project_no ?? ""} ${s.site_name}`.trim(),
            subtitle: `${s.customer_name} · ${s.address} · 担当:${s.assignee ?? "—"}`,
            href: `/projects-v1?id=${s.project_id}&source=survey`,
        });
    }
    return hits.slice(0, limit);
}

import { getDatabase } from "../db/database.js";
export function unifiedSearch(query, limit = 40) {
    const q = query.trim();
    if (!q)
        return [];
    const like = `%${q}%`;
    const hits = [];
    const customers = getDatabase()
        .prepare(`SELECT id, name, company, address, phone, email FROM toms_customer_master
       WHERE name LIKE ? OR company LIKE ? OR phone LIKE ? OR address LIKE ? OR email LIKE ?
       LIMIT 15`)
        .all(like, like, like, like, like);
    for (const c of customers) {
        hits.push({
            kind: "customer",
            id: String(c.id),
            title: String(c.name),
            subtitle: [c.company, c.phone, c.address].filter(Boolean).join(" · "),
            href: `/customer-master?id=${c.id}`,
            score: 10,
        });
    }
    const projects = getDatabase()
        .prepare(`SELECT id, project_no, customer_name, title, address, phone, status
       FROM business_projects
       WHERE project_no LIKE ? OR customer_name LIKE ? OR title LIKE ? OR address LIKE ? OR phone LIKE ?
       ORDER BY updated_at DESC LIMIT 20`)
        .all(like, like, like, like, like);
    for (const p of projects) {
        hits.push({
            kind: "project",
            id: String(p.id),
            title: `${p.project_no} ${p.title}`,
            subtitle: `${p.customer_name} · ${p.address} · ${p.status}`,
            href: `/project/${p.id}`,
            score: 20,
        });
    }
    const estimates = getDatabase()
        .prepare(`SELECT e.id, e.estimate_no, e.project_id, p.title
       FROM business_estimates e
       JOIN business_projects p ON p.id = e.project_id
       WHERE e.estimate_no LIKE ? OR p.title LIKE ?
       LIMIT 10`)
        .all(like, like);
    for (const e of estimates) {
        hits.push({
            kind: "estimate",
            id: String(e.id),
            title: String(e.estimate_no),
            subtitle: String(e.title),
            href: `/project/${e.project_id}`,
            score: 15,
        });
    }
    const invoices = getDatabase()
        .prepare(`SELECT i.id, i.invoice_no, i.project_id, p.title
       FROM business_invoices i
       JOIN business_projects p ON p.id = i.project_id
       WHERE i.invoice_no LIKE ? OR p.title LIKE ?
       LIMIT 10`)
        .all(like, like);
    for (const inv of invoices) {
        hits.push({
            kind: "invoice",
            id: String(inv.id),
            title: String(inv.invoice_no),
            subtitle: String(inv.title),
            href: `/project/${inv.project_id}`,
            score: 15,
        });
    }
    const assets = getDatabase()
        .prepare(`SELECT id, label, asset_type, serial_number, project_id FROM toms_assets
       WHERE label LIKE ? OR serial_number LIKE ? OR asset_type LIKE ?
       LIMIT 10`)
        .all(like, like, like);
    for (const a of assets) {
        hits.push({
            kind: "asset",
            id: String(a.id),
            title: `${a.asset_type}: ${a.label}`,
            subtitle: String(a.serial_number ?? ""),
            href: `/asset/${a.id}`,
            score: 12,
        });
    }
    const maint = getDatabase()
        .prepare(`SELECT case_id, site_name, status, customer_code FROM maintenance_cases
       WHERE site_name LIKE ? OR notes LIKE ? OR customer_code LIKE ?
       LIMIT 10`)
        .all(like, like, like);
    for (const m of maint) {
        hits.push({
            kind: "maintenance",
            id: String(m.case_id),
            title: String(m.site_name),
            subtitle: `${m.customer_code} · ${m.status}`,
            href: "/maintenance",
            score: 8,
        });
    }
    const construction = getDatabase()
        .prepare(`SELECT id, title, construction_schedule_json FROM business_projects
       WHERE construction_schedule_json LIKE ? LIMIT 5`)
        .all(like);
    for (const c of construction) {
        if (!hits.some((h) => h.id === c.id && h.kind === "project")) {
            hits.push({
                kind: "project",
                id: String(c.id),
                title: `施工日: ${c.title}`,
                subtitle: String(c.construction_schedule_json ?? "").slice(0, 80),
                href: `/project/${c.id}`,
                score: 14,
            });
        }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

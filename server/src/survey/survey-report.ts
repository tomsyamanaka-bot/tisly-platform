import { getCustomerByCode } from "../customer/customer-store.js";
import {
  getSurveyProject,
  listSurveyPhotos,
  listSurveyDrawings,
  getSurveyChecklist,
  getSurveyProjectNotes,
} from "./survey-store.js";
import { getLatestAiIntake } from "./ai-intake.js";
import { getSurveyProMapLink } from "./survey-to-pro-map.js";
import { getLatestAiEstimate } from "./survey-store.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function photoSection(photos: ReturnType<typeof listSurveyPhotos>, types: string[], title: string): string {
  const filtered = photos.filter((p) => types.includes(p.photoType));
  if (!filtered.length) return `<section><h2>${title}</h2><p class="muted">なし</p></section>`;
  const imgs = filtered
    .map((p) => `<figure><img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.photoType)}" /><figcaption>${escapeHtml(p.photoType)}</figcaption></figure>`)
    .join("");
  return `<section><h2>${title}</h2><div class="photo-grid">${imgs}</div></section>`;
}

export function buildSurveyReportHtml(projectId: string): string {
  const project = getSurveyProject(projectId);
  if (!project) throw new Error("project not found");
  const customer = getCustomerByCode(project.customerCode);
  const photos = listSurveyPhotos(projectId);
  const drawings = listSurveyDrawings(projectId);
  const checklist = getSurveyChecklist(projectId);
  const intake = getLatestAiIntake(projectId);
  const estimate = getLatestAiEstimate(projectId);
  const proLink = getSurveyProMapLink(projectId);
  const notes = getSurveyProjectNotes(projectId);

  const checklistRows = Object.entries(checklist)
    .map(([k, v]) => {
      const item = v as { label?: string; checked?: boolean; note?: string };
      return `<tr><td>${escapeHtml(item.label ?? k)}</td><td>${item.checked ? "✓" : "—"}</td><td>${escapeHtml(item.note ?? "")}</td></tr>`;
    })
    .join("");

  const drawingHtml = drawings.length
    ? drawings
        .map(
          (d) =>
            `<figure><img src="${escapeHtml(d.url)}" alt="図面" /><figcaption>${escapeHtml(d.fileName ?? d.id)}</figcaption></figure>`
        )
        .join("")
    : "<p class=\"muted\">なし</p>";

  const aiBlock = intake
    ? `<pre>${escapeHtml(JSON.stringify(intake, null, 2))}</pre>`
    : "<p class=\"muted\">AI Intake 未実行</p>";

  const estBlock = estimate
    ? `<pre>${escapeHtml(JSON.stringify(estimate.recommended, null, 2))}</pre>`
    : "<p class=\"muted\">見積候補未生成</p>";

  const proStatus = proLink.linked
    ? `<a href="/customer/${escapeHtml(project.customerCode)}/pro-remote">PRO Remote 連携済み</a>`
    : "未連携 — generate-floor-map を実行してください";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>現調レポート — ${escapeHtml(project.siteName)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 1.5rem; color: #111; }
    h1 { font-size: 1.5rem; }
    .meta { background: #f1f5f9; padding: 1rem; border-radius: 8px; }
    .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
    .photo-grid img { width: 100%; border-radius: 6px; border: 1px solid #cbd5e1; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e2e8f0; padding: 0.5rem; text-align: left; }
    .muted { color: #64748b; }
    pre { background: #f8fafc; padding: 1rem; overflow: auto; font-size: 0.85rem; border-radius: 6px; }
    .tag { display: inline-block; background: #dbeafe; color: #1e40af; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
  </style>
</head>
<body>
  <h1>現調レポート <span class="tag">Phase 501–520</span></h1>
  <div class="meta">
    <p><strong>現場名:</strong> ${escapeHtml(project.siteName)}</p>
    <p><strong>顧客:</strong> ${escapeHtml(customer?.customer_name ?? project.customerCode)} (${escapeHtml(project.customerCode)})</p>
    <p><strong>住所:</strong> ${escapeHtml(project.address ?? "—")}</p>
    <p><strong>案件ID:</strong> ${escapeHtml(projectId)}</p>
    <p><strong>GPS:</strong> ${project.gpsLat != null ? `${project.gpsLat}, ${project.gpsLng}` : "—"}</p>
    ${notes ? `<p><strong>メモ:</strong> ${escapeHtml(notes)}</p>` : ""}
  </div>
  ${photoSection(photos, ["aerial"], "航空写真")}
  ${photoSection(photos, ["outside"], "外観写真")}
  ${photoSection(photos, ["inside"], "室内写真")}
  <section><h2>手書き図面</h2><div class="photo-grid">${drawingHtml}</div></section>
  <section><h2>チェックリスト</h2><table><thead><tr><th>項目</th><th>確認</th><th>メモ</th></tr></thead><tbody>${checklistRows}</tbody></table></section>
  <section><h2>AI Intake 候補</h2>${aiBlock}</section>
  <section><h2>AI見積候補（現調候補）</h2>${estBlock}</section>
  <section><h2>PRO Remote 連携</h2><p>${proStatus}</p></section>
  <footer><p class="muted">生成: ${new Date().toISOString()} — PDF出力は Phase 521+ 予定</p></footer>
</body>
</html>`;
}

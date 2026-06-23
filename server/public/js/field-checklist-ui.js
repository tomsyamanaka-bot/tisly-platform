/** 現場チェックリスト UI（案件詳細 / field-checklist-v1 共通） */

import {
  buildDefaultChecklistItems,
  checklistStatusFromItems,
  loadFieldChecklistLocal,
  saveFieldChecklistLocal,
  TEMP_FIELD_PROJECT_ID,
} from "./field-checklist-defaults-v1.js?v=fc-defaults-v1";

const WORK_API = "/api/work-session/v1";

export { buildDefaultChecklistItems, checklistStatusFromItems, TEMP_FIELD_PROJECT_ID };

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemStatus(it, forceReason = "") {
  if (it.checked) {
    return { state: "done", label: "確認済", cardClass: "fc-card--done", toggleLabel: "完了を解除" };
  }
  if (forceReason) {
    return { state: "forced", label: "強制完了", cardClass: "fc-card--forced", toggleLabel: "強制完了（未確認）" };
  }
  return { state: "pending", label: "未確認", cardClass: "fc-card--pending", toggleLabel: "完了にする" };
}

function itemTopBadges(it, forceReason = "") {
  const status = itemStatus(it, forceReason);
  const badges = [`<span class="fc-badge fc-badge--${status.state}">${status.label}</span>`];
  if (it.photoUrl) badges.push(`<span class="fc-badge fc-badge--photo">写真あり</span>`);
  if (it.memo?.trim()) badges.push(`<span class="fc-badge fc-badge--memo">メモあり</span>`);
  if (!it.checked && !forceReason) badges.push(`<span class="fc-badge fc-badge--incomplete">未完了</span>`);
  return badges.join("");
}

function cardStateClass(it, forceReason = "") {
  return itemStatus(it, forceReason).cardClass;
}

function renderStatsRow({ total, checked, unchecked, forced = 0 }) {
  const forcedStat =
    forced > 0
      ? `<div class="checklist-stat checklist-stat--forced"><strong>${forced}</strong><span>強制完了</span></div>`
      : "";
  return `<div class="checklist-stats-row">
    <div class="checklist-stat checklist-stat--done"><strong>${checked}</strong><span>完了</span></div>
    <div class="checklist-stat checklist-stat--pending"><strong>${unchecked}</strong><span>未確認</span></div>
    ${forcedStat}
    <div class="checklist-stat"><strong>${total}</strong><span>合計</span></div>
  </div>`;
}

export function renderFieldChecklistStatusSummary({ status = null, session = null, showOpenButton = false, openHref = "#" }) {
  const total = status?.total ?? 0;
  const checked = status?.checked ?? 0;
  const unchecked = status?.unchecked ?? Math.max(0, total - checked);
  const forced = status?.forced ?? 0;
  const pct = total ? Math.round((checked / total) * 100) : 0;
  const forceReason = session?.forceCompleteReason?.trim() || status?.forceCompleteReason?.trim() || "";

  if (!total) {
    return `<div class="checklist-overview-card">
      <p class="section-label" style="margin:0;">✅ 現場チェックリスト</p>
      <p class="section-hint">到着記録後にチェックリストが自動生成されます</p>
      ${showOpenButton ? `<a href="${escapeHtml(openHref)}" class="btn-fc-open">チェックリストを開く</a>` : ""}
    </div>`;
  }

  const warn =
    unchecked > 0 && !forceReason
      ? `<p class="checklist-warn">⚠️ 未確認 ${unchecked} 件 — 作業完了・完了報告書作成前に確認してください</p>`
      : unchecked === 0
        ? `<p class="checklist-ok">✅ すべて確認済み（${pct}%）</p>`
        : "";

  const forceWarn = forceReason
    ? `<p class="checklist-force-warn">⚠️ 強制完了 ${forced} 件 — ${escapeHtml(forceReason)}</p>`
    : "";

  return `<div class="checklist-overview-card">
    <p class="section-label" style="margin:0;">✅ 現場チェックリスト</p>
    ${renderStatsRow({ total, checked, unchecked, forced })}
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    ${warn}
    ${forceWarn}
    ${showOpenButton ? `<a href="${escapeHtml(openHref)}" class="btn-fc-open">チェックリストを開く</a>` : ""}
  </div>`;
}

export function renderFieldChecklistPanel({
  items = [],
  status = null,
  showHeader = true,
  showSyncButton = false,
  forceReason = "",
}) {
  const total = status?.total ?? items.length;
  const checked = status?.checked ?? items.filter((i) => i.checked).length;
  const pct = total ? Math.round((checked / total) * 100) : 0;
  const unchecked = status?.unchecked ?? Math.max(0, total - checked);
  const forced = status?.forced ?? 0;
  const sessionForce = forceReason || status?.forceCompleteReason?.trim() || "";

  const header = showHeader
    ? `<div class="checklist-head field-checklist-panel">
        <p class="section-label" style="margin:0;">✅ 現場チェックリスト</p>
        ${renderStatsRow({ total, checked, unchecked, forced })}
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        ${
          unchecked > 0 && !sessionForce
            ? `<p class="checklist-warn">⚠️ 未確認 ${unchecked} 件 — タップで確認済みにしてください</p>`
            : total > 0 && unchecked === 0
              ? `<p class="checklist-ok">✅ すべて確認済み</p>`
              : sessionForce && unchecked > 0
                ? `<p class="checklist-force-warn">⚠️ 強制完了 ${forced} 件 — ${escapeHtml(sessionForce)}</p>`
                : ""
        }
        ${showSyncButton ? `<button type="button" class="btn-fc-sync" data-action="sync-templates">🔄 テンプレートから同期</button>` : ""}
      </div>`
    : "";

  const list =
    items.length === 0
      ? `<p class="section-hint">到着記録後にチェックリストが自動生成されます</p>`
      : `<div class="field-checklist-items">${items
          .map((it) => {
            const st = itemStatus(it, sessionForce);
            return `<article class="fc-card ${cardStateClass(it, sessionForce)}" data-item-id="${escapeHtml(it.id)}">
              <div class="fc-card-top-badges">${itemTopBadges(it, sessionForce)}</div>
              <div class="fc-card-head">
                <button type="button" class="fc-check-toggle" data-check-id="${escapeHtml(it.id)}" aria-pressed="${it.checked ? "true" : "false"}" aria-label="${st.toggleLabel}">${it.checked ? "✓" : ""}</button>
                <div class="fc-card-body">
                  <span class="fc-card-cat">${escapeHtml(it.category)}</span>
                  <p class="fc-card-title">${escapeHtml(it.label)}</p>
                </div>
              </div>
              <textarea class="fc-memo" data-memo-for="${escapeHtml(it.id)}" rows="4" placeholder="メモ（現場メモ・未確認時の理由など）">${escapeHtml(it.memo || "")}</textarea>
              <div class="fc-photo-row">
                ${
                  it.photoUrl
                    ? `<a href="${escapeHtml(it.photoUrl)}" target="_blank" rel="noopener" class="fc-thumb"><img src="${escapeHtml(it.photoUrl)}" alt="添付写真" /></a>`
                    : `<span class="section-hint fc-photo-empty">写真なし</span>`
                }
                <label class="btn-fc-photo">
                  📷 写真を添付
                  <input type="file" accept="image/*" capture="environment" data-photo-for="${escapeHtml(it.id)}" hidden />
                </label>
              </div>
            </article>`;
          })
          .join("")}</div>`;

  return `${header}${list}`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("ファイル読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

async function refreshPanel(root, { apiFetch, toast, projectSource, projectId, showHeader, showSyncButton, onRefresh }) {
  if (!projectSource || !projectId) return;
  const q = new URLSearchParams({ source: projectSource, projectId });
  const data = await apiFetch(`${WORK_API}/session?${q.toString()}`);
  root.innerHTML = renderFieldChecklistPanel({
    items: data.checklist || [],
    status: data.checklistStatus,
    showHeader,
    showSyncButton,
    forceReason: data.session?.forceCompleteReason || data.checklistStatus?.forceCompleteReason || "",
  });
  bindFieldChecklistPanel(root, { apiFetch, toast, projectSource, projectId, showHeader, showSyncButton, onRefresh });
  onRefresh?.(data);
}

export function bindFieldChecklistPanel(root, {
  apiFetch,
  toast,
  projectSource,
  projectId,
  showHeader = true,
  showSyncButton = false,
  onRefresh,
  localOnly = false,
  items: localItems = null,
}) {
  if (!root) return;

  if (localOnly && localItems) {
    root.querySelectorAll("[data-check-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.checkId;
        const nextChecked = btn.getAttribute("aria-pressed") !== "true";
        const updated = localItems.map((it) => (it.id === id ? { ...it, checked: nextChecked } : it));
        saveFieldChecklistLocal(projectId, updated);
        localItems.splice(0, localItems.length, ...updated);
        root.innerHTML = renderFieldChecklistPanel({
          items: updated,
          status: checklistStatusFromItems(updated),
          showHeader,
          showSyncButton: false,
        });
        bindFieldChecklistPanel(root, {
          toast,
          projectId,
          showHeader,
          localOnly: true,
          items: localItems,
        });
        toast?.(nextChecked ? "確認済みにしました" : "未確認に戻しました");
      });
    });

    root.querySelectorAll("textarea[data-memo-for]").forEach((input) => {
      let timer = null;
      const saveMemo = () => {
        const itemId = input.dataset.memoFor;
        const updated = localItems.map((it) => (it.id === itemId ? { ...it, memo: input.value } : it));
        saveFieldChecklistLocal(projectId, updated);
        localItems.splice(0, localItems.length, ...updated);
      };
      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(saveMemo, 400);
      });
      input.addEventListener("blur", saveMemo);
    });
    return;
  }

  root.querySelectorAll("[data-check-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.checkId;
      const nextChecked = btn.getAttribute("aria-pressed") !== "true";
      try {
        await apiFetch(`${WORK_API}/completion-checklist/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ checked: nextChecked }),
        });
        await refreshPanel(root, { apiFetch, toast, projectSource, projectId, showHeader, showSyncButton, onRefresh });
      } catch (e) {
        toast?.(e.message || "チェック更新に失敗しました");
      }
    });
  });

  root.querySelectorAll("input[data-photo-for]").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      const itemId = input.dataset.photoFor;
      try {
        const imageBase64 = await readFileAsBase64(file);
        await apiFetch(`${WORK_API}/completion-checklist/${itemId}/photo`, {
          method: "POST",
          body: JSON.stringify({ imageBase64, fileName: file.name, title: file.name }),
        });
        toast?.("写真を添付しました");
        await refreshPanel(root, { apiFetch, toast, projectSource, projectId, showHeader, showSyncButton, onRefresh });
      } catch (e) {
        toast?.(e.message || "写真添付に失敗しました");
      }
    });
  });

  root.querySelectorAll("textarea[data-memo-for], input[data-memo-for]").forEach((input) => {
    let timer = null;
    const saveMemo = async () => {
      const itemId = input.dataset.memoFor;
      try {
        await apiFetch(`${WORK_API}/completion-checklist/${itemId}`, {
          method: "PATCH",
          body: JSON.stringify({ memo: input.value }),
        });
        const card = input.closest(".fc-card");
        const badgeMount = card?.querySelector(".fc-card-top-badges");
        if (badgeMount && card) {
          const checked = card.classList.contains("fc-card--done");
          const hasPhoto = Boolean(card.querySelector(".fc-thumb"));
          badgeMount.innerHTML = itemTopBadges(
            { checked, memo: input.value, photoUrl: hasPhoto ? "1" : null },
            card.classList.contains("fc-card--forced") ? "forced" : ""
          );
        }
      } catch (e) {
        toast?.(e.message || "メモ保存に失敗しました");
      }
    };
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(saveMemo, 500);
    });
    input.addEventListener("blur", () => {
      clearTimeout(timer);
      saveMemo();
    });
  });

  root.querySelector("[data-action='sync-templates']")?.addEventListener("click", async () => {
    if (!window.confirm("最新テンプレートの項目をこの案件に反映します。\n既存のチェック状態は保持されます。続行しますか？")) {
      return;
    }
    try {
      const data = await apiFetch(`${WORK_API}/completion-checklist/sync-templates`, {
        method: "POST",
        body: JSON.stringify({ projectSource, projectId }),
      });
      toast?.(`テンプレートを同期しました（${data.added ?? 0}件追加）`);
      await refreshPanel(root, { apiFetch, toast, projectSource, projectId, showHeader, showSyncButton, onRefresh });
    } catch (e) {
      toast?.(e.message || "テンプレート同期に失敗しました");
    }
  });
}

export async function loadFieldChecklist(apiFetch, { projectSource, projectId }) {
  const q = new URLSearchParams({ source: projectSource, projectId });
  try {
    const data = await apiFetch(`${WORK_API}/session?${q.toString()}`);
    if (!data.checklist?.length) {
      if (data.session?.arrivalTime) {
        try {
          await apiFetch(`${WORK_API}/completion-checklist/generate`, {
            method: "POST",
            body: JSON.stringify({ projectSource, projectId }),
          });
          const regen = await apiFetch(`${WORK_API}/session?${q.toString()}`);
          if (regen.checklist?.length) return regen;
        } catch {
          /* fall through to defaults */
        }
      }
      const local = loadFieldChecklistLocal(projectId);
      const defaults = local || buildDefaultChecklistItems();
      if (defaults.length) {
        saveFieldChecklistLocal(projectId, defaults);
        return {
          ...data,
          checklist: defaults,
          checklistStatus: checklistStatusFromItems(defaults),
          defaultItemsApplied: true,
        };
      }
    }
    return data;
  } catch {
    const local = loadFieldChecklistLocal(projectId);
    const defaults = local || buildDefaultChecklistItems();
    return {
      session: null,
      checklist: defaults,
      checklistStatus: checklistStatusFromItems(defaults),
      defaultItemsApplied: true,
    };
  }
}

/** 完了報告書作成前の未確認チェック（確認ダイアログ付き） */
export async function confirmChecklistBeforeReport(apiFetch, { projectSource, projectId }) {
  try {
    const q = new URLSearchParams({ source: projectSource, projectId });
    const statusData = await apiFetch(`${WORK_API}/completion-checklist/status?${q.toString()}`);
    if (statusData.unchecked > 0 && !statusData.forceCompleteReason) {
      const labels = statusData.uncheckedLabels?.slice(0, 4).join("、") || "";
      const ok = window.confirm(
        `未確認のチェックが ${statusData.unchecked} 件あります。\n${labels}${statusData.unchecked > 4 ? " 他" : ""}\n\nこのまま完了報告書を作成しますか？`
      );
      return ok;
    }
  } catch {
    /* status unavailable — proceed */
  }
  return true;
}

const AUTOMATION_API = "/api/project-automation/v1";

/** 完了報告PDF作成前 — 施工写真スロットチェック（モーダル） */
export function confirmCompletionPhotoSlotsBeforeReport(apiFetch, { projectId }) {
  return new Promise((resolve) => {
    (async () => {
      let photos = [];
      try {
        const data = await apiFetch(`${AUTOMATION_API}/projects/${encodeURIComponent(projectId)}/completion-report-photos`);
        photos = data.photos ?? data ?? [];
      } catch {
        resolve(true);
        return;
      }
      if (!photos.length) {
        resolve(true);
        return;
      }

      const overlay = document.createElement("div");
      overlay.className = "cr-photo-check-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.innerHTML = `
        <div class="cr-photo-check-sheet">
          <h2 class="cr-photo-check-title">施工写真チェック</h2>
          <ul class="cr-photo-check-list">
            ${photos
              .map(
                (p) =>
                  `<li class="${p.hasPhoto ? "ok" : "missing"}">${p.hasPhoto ? "✅" : "❌"} ${escapeHtml(p.photoSlotName)}</li>`
              )
              .join("")}
          </ul>
          <p class="cr-photo-check-hint">PDFには撮影済みの写真のみ、テンプレート順で載せます。</p>
          <div class="cr-photo-check-actions">
            <button type="button" class="btn-sub" data-action="add-photos">写真を追加する</button>
            <button type="button" class="btn-main blue" data-action="proceed">不足ありでもPDF作成</button>
          </div>
        </div>`;

      if (!document.getElementById("cr-photo-check-styles")) {
        const style = document.createElement("style");
        style.id = "cr-photo-check-styles";
        style.textContent = `
          .cr-photo-check-overlay { position:fixed; inset:0; z-index:1200; background:rgba(15,23,42,0.55); display:flex; align-items:flex-end; justify-content:center; padding:1rem; }
          .cr-photo-check-sheet { background:#fff; border-radius:16px 16px 12px 12px; width:100%; max-width:420px; padding:1rem 1rem 1.25rem; box-shadow:0 12px 40px rgba(0,0,0,0.2); }
          .cr-photo-check-title { margin:0 0 0.65rem; font-size:1.05rem; }
          .cr-photo-check-list { list-style:none; margin:0 0 0.75rem; padding:0; display:flex; flex-direction:column; gap:0.35rem; }
          .cr-photo-check-list li { padding:0.45rem 0.55rem; border-radius:8px; font-size:0.9rem; }
          .cr-photo-check-list li.ok { background:#f0fdf4; color:#166534; }
          .cr-photo-check-list li.missing { background:#fef2f2; color:#b91c1c; }
          .cr-photo-check-hint { font-size:0.78rem; color:#64748b; margin:0 0 0.85rem; }
          .cr-photo-check-actions { display:flex; flex-direction:column; gap:0.45rem; }
        `;
        document.head.appendChild(style);
      }

      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      overlay.querySelector('[data-action="proceed"]')?.addEventListener("click", () => cleanup(true));
      overlay.querySelector('[data-action="add-photos"]')?.addEventListener("click", () => {
        cleanup(false);
        window.location.href = `/documents-v1?projectId=${encodeURIComponent(projectId)}`;
      });
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) cleanup(false);
      });

      document.body.appendChild(overlay);
    })();
  });
}

/** 仕様書PDF作成前 — 仕様書写真スロットチェック（モーダル） */
export function confirmSpecificationPhotoSlotsBeforeReport(apiFetch, { projectId }) {
  return new Promise((resolve) => {
    (async () => {
      let photos = [];
      try {
        const data = await apiFetch(
          `${AUTOMATION_API}/projects/${encodeURIComponent(projectId)}/specification-photos`
        );
        photos = data.photos ?? [];
      } catch {
        resolve(true);
        return;
      }
      if (!photos.length) {
        resolve(true);
        return;
      }

      const missing = photos.filter((p) => p.missing);
      const requiredMissing = missing.filter((p) => p.required);

      const overlay = document.createElement("div");
      overlay.className = "cr-photo-check-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.innerHTML = `
        <div class="cr-photo-check-sheet">
          <h2 class="cr-photo-check-title">仕様書写真チェック</h2>
          <ul class="cr-photo-check-list">
            ${photos
              .map((p) => {
                const qnap =
                  p.hasPhoto && p.qnapStatusIcon
                    ? ` <span class="qnap-mini">${p.qnapStatusIcon}${escapeHtml(p.qnapStatusLabel || "")}</span>`
                    : "";
                return `<li class="${p.hasPhoto ? "ok" : p.required ? "missing" : "warn"}">${p.hasPhoto ? "✅" : p.required ? "❌" : "⚠️"} ${escapeHtml(p.photoSlotName)}${qnap}</li>`;
              })
              .join("")}
          </ul>
          <p class="cr-photo-check-hint">PDFには撮影済みスロットのみ載せます。${missing.length ? `未撮影 ${missing.length}件` : ""}${requiredMissing.length ? `（必須不足 ${requiredMissing.length}件）` : ""}</p>
          <div class="cr-photo-check-actions">
            <button type="button" class="btn-sub" data-action="add-photos">写真を追加する</button>
            <button type="button" class="btn-main blue" data-action="proceed">不足ありでもPDF作成</button>
          </div>
        </div>`;

      if (!document.getElementById("cr-photo-check-styles")) {
        const style = document.createElement("style");
        style.id = "cr-photo-check-styles";
        style.textContent = `
          .cr-photo-check-overlay { position:fixed; inset:0; z-index:1200; background:rgba(15,23,42,0.55); display:flex; align-items:flex-end; justify-content:center; padding:1rem; }
          .cr-photo-check-sheet { background:#fff; border-radius:16px 16px 12px 12px; width:100%; max-width:420px; padding:1rem 1rem 1.25rem; box-shadow:0 12px 40px rgba(0,0,0,0.2); }
          .cr-photo-check-title { margin:0 0 0.65rem; font-size:1.05rem; }
          .cr-photo-check-list { list-style:none; margin:0 0 0.75rem; padding:0; display:flex; flex-direction:column; gap:0.35rem; max-height:50vh; overflow:auto; }
          .cr-photo-check-list li { padding:0.45rem 0.55rem; border-radius:8px; font-size:0.9rem; }
          .cr-photo-check-list li.ok { background:#f0fdf4; color:#166534; }
          .cr-photo-check-list li.missing { background:#fef2f2; color:#b91c1c; }
          .cr-photo-check-list li.warn { background:#fffbeb; color:#92400e; }
          .cr-photo-check-list .qnap-mini { font-size:0.75rem; color:#64748b; }
          .cr-photo-check-hint { font-size:0.78rem; color:#64748b; margin:0 0 0.85rem; }
          .cr-photo-check-actions { display:flex; flex-direction:column; gap:0.45rem; }
        `;
        document.head.appendChild(style);
      }

      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      overlay.querySelector('[data-action="proceed"]')?.addEventListener("click", () => cleanup(true));
      overlay.querySelector('[data-action="add-photos"]')?.addEventListener("click", () => {
        cleanup(false);
        window.location.href = `/documents-v1?projectId=${encodeURIComponent(projectId)}`;
      });
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) cleanup(false);
      });

      document.body.appendChild(overlay);
    })();
  });
}

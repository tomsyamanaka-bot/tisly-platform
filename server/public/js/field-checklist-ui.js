/** 現場チェックリスト UI（案件詳細 / field-checklist-v1 共通） */

const WORK_API = "/api/work-session/v1";

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
}) {
  if (!root) return;

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
  const data = await apiFetch(`${WORK_API}/session?${q.toString()}`);
  if (!data.checklist?.length && data.session?.arrivalTime) {
    await apiFetch(`${WORK_API}/completion-checklist/generate`, {
      method: "POST",
      body: JSON.stringify({ projectSource, projectId }),
    });
    return apiFetch(`${WORK_API}/session?${q.toString()}`);
  }
  return data;
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

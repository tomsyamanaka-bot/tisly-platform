/** 現場チェックリスト UI（案件詳細 / field-checklist-v1 共通） */

const WORK_API = "/api/work-session/v1";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderFieldChecklistPanel({ items = [], status = null, showHeader = true }) {
  const total = status?.total ?? items.length;
  const checked = status?.checked ?? items.filter((i) => i.checked).length;
  const pct = total ? Math.round((checked / total) * 100) : 0;
  const warn =
    status?.unchecked > 0
      ? `<p class="checklist-warn">⚠️ 未完了 ${status.unchecked} 件 — 作業完了前に確認してください</p>`
      : total > 0 && checked === total
        ? `<p class="checklist-ok">✅ すべて確認済み</p>`
        : "";

  const header = showHeader
    ? `<div class="checklist-head">
        <p class="section-label" style="margin:0;">✅ 現場チェックリスト</p>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <p class="section-hint">${checked}/${total}（${pct}%）</p>
        ${warn}
      </div>`
    : "";

  const list =
    items.length === 0
      ? `<p class="section-hint">到着記録後にチェックリストが自動生成されます</p>`
      : `<div class="field-checklist-items">${items
          .map(
            (it) => `<div class="field-check-item${it.checked ? " checked" : ""}" data-item-id="${escapeHtml(it.id)}">
              <label class="field-check-row">
                <input type="checkbox" data-check-id="${escapeHtml(it.id)}" ${it.checked ? "checked" : ""} />
                <span class="field-check-label">${escapeHtml(it.label)}</span>
                <span class="field-check-cat">${escapeHtml(it.category)}</span>
              </label>
              <div class="field-check-photo-row">
                ${
                  it.photoUrl
                    ? `<a href="${escapeHtml(it.photoUrl)}" target="_blank" rel="noopener" class="field-check-thumb"><img src="${escapeHtml(it.photoUrl)}" alt="" /></a>`
                    : `<span class="field-check-no-photo">写真なし</span>`
                }
                <label class="btn-photo-attach">
                  📷 写真
                  <input type="file" accept="image/*" capture="environment" data-photo-for="${escapeHtml(it.id)}" hidden />
                </label>
              </div>
              <input type="text" class="field-check-memo" data-memo-for="${escapeHtml(it.id)}" placeholder="メモ（任意）" value="${escapeHtml(it.memo || "")}" />
            </div>`
          )
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

export function bindFieldChecklistPanel(root, { apiFetch, toast, projectSource, projectId }) {
  if (!root) return;

  root.querySelectorAll("input[data-check-id]").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.dataset.checkId;
      try {
        await apiFetch(`${WORK_API}/completion-checklist/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ checked: input.checked }),
        });
        input.closest(".field-check-item")?.classList.toggle("checked", input.checked);
      } catch (e) {
        input.checked = !input.checked;
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
        if (projectSource && projectId) {
          const q = new URLSearchParams({ source: projectSource, projectId });
          const data = await apiFetch(`${WORK_API}/session?${q.toString()}`);
          root.innerHTML = renderFieldChecklistPanel({
            items: data.checklist || [],
            status: data.checklistStatus,
          });
          bindFieldChecklistPanel(root, { apiFetch, toast, projectSource, projectId });
        }
      } catch (e) {
        toast?.(e.message || "写真添付に失敗しました");
      }
    });
  });

  root.querySelectorAll("input[data-memo-for]").forEach((input) => {
    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const itemId = input.dataset.memoFor;
        try {
          await apiFetch(`${WORK_API}/completion-checklist/${itemId}`, {
            method: "PATCH",
            body: JSON.stringify({ memo: input.value }),
          });
        } catch (e) {
          toast?.(e.message || "メモ保存に失敗しました");
        }
      }, 500);
    });
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

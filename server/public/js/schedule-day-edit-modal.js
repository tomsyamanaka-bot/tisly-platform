/**
 * 日程日付の詳細メモ編集モーダル（日程調整・日程詳細で共通）
 */

const DAY_EDIT_SAVE_OK = "保存しました";
const DAY_EDIT_SAVE_FAIL = "保存に失敗しました";

let dayEditApi = null;
let dayEditToast = null;
let dayEditReasonPresets = [];
let dayEditDate = "";
let dayEditLastSaved = null;
let dayEditSaveTimer = null;
let dayEditOnSaved = null;

function dayEdit$(id) {
  return document.getElementById(id);
}

function dayEditEscapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dayEditFormatDateLabel(iso) {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(`${iso}T12:00:00`).getDay()];
  return `${m}月${d}日（${wd}）`;
}

function dayEditReasonOptions(selected) {
  const presets = dayEditReasonPresets.length
    ? dayEditReasonPresets
    : ["", "事務処理", "家族予定", "材料待ち", "移動不可", "電話対応のみ"];
  const options = presets.includes("") ? presets : ["", ...presets];
  return options
    .map((r) => {
      const label = r || "（現場不可にしない）";
      return `<option value="${dayEditEscapeHtml(r)}"${r === selected ? " selected" : ""}>${dayEditEscapeHtml(label)}</option>`;
    })
    .join("");
}

function dayEditShowStatus(msg, isError = false) {
  const el = dayEdit$("day-edit-status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b91c1c" : "#64748b";
}

function dayEditReadForm() {
  return {
    note: dayEdit$("day-edit-note")?.value ?? "",
    unavailableReason: dayEdit$("day-edit-unavail-reason")?.value ?? "",
    detailMemo: dayEdit$("day-edit-detail-memo")?.value ?? "",
    eventRemark: dayEdit$("day-edit-event-remark")?.value ?? "",
  };
}

function dayEditSnapshotMatches(form) {
  if (!dayEditLastSaved) return false;
  return (
    dayEditLastSaved.note === form.note &&
    dayEditLastSaved.unavailableReason === form.unavailableReason &&
    dayEditLastSaved.detailMemo === form.detailMemo &&
    dayEditLastSaved.eventRemark === form.eventRemark
  );
}

async function dayEditPersist({ quiet = false } = {}) {
  if (!dayEditDate || !dayEditApi) return;
  const form = dayEditReadForm();
  if (dayEditSnapshotMatches(form)) return;
  try {
    const saved = await dayEditApi("/day-note", {
      method: "PATCH",
      body: JSON.stringify({
        date: dayEditDate,
        note: form.note,
        eventRemark: form.eventRemark,
        unavailableReason: form.unavailableReason,
        detailMemo: form.detailMemo,
      }),
    });
    dayEditLastSaved = {
      note: saved.note ?? "",
      eventRemark: saved.eventRemark ?? "",
      unavailableReason: saved.unavailableReason ?? "",
      detailMemo: saved.detailMemo ?? "",
    };
    dayEditShowStatus(DAY_EDIT_SAVE_OK);
    if (!quiet && dayEditToast) dayEditToast(DAY_EDIT_SAVE_OK);
    dayEditOnSaved?.(saved);
  } catch (e) {
    dayEditShowStatus(DAY_EDIT_SAVE_FAIL, true);
    if (!quiet && dayEditToast) dayEditToast(DAY_EDIT_SAVE_FAIL);
    throw e;
  }
}

function dayEditFlushKeepalive() {
  if (!dayEditDate || !dayEditApi) return;
  const form = dayEditReadForm();
  if (dayEditSnapshotMatches(form)) return;
  const token = dayEditApi.token?.();
  if (!token) return;
  fetch("/api/schedule/v1/day-note", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      date: dayEditDate,
      note: form.note,
      eventRemark: form.eventRemark,
      unavailableReason: form.unavailableReason,
      detailMemo: form.detailMemo,
    }),
    keepalive: true,
  });
  dayEditLastSaved = { ...form };
}

function dayEditBindInputs() {
  const fields = ["day-edit-note", "day-edit-unavail-reason", "day-edit-detail-memo", "day-edit-event-remark"];
  for (const id of fields) {
    const el = dayEdit$(id);
    if (!el || el.dataset.dayEditBound === "1") continue;
    el.dataset.dayEditBound = "1";
    const scheduleSave = (quiet) => {
      if (dayEditSaveTimer) {
        clearTimeout(dayEditSaveTimer);
        dayEditSaveTimer = null;
      }
      dayEditPersist({ quiet }).catch(() => {});
    };
    el.addEventListener("input", () => {
      dayEditShowStatus("");
      if (dayEditSaveTimer) clearTimeout(dayEditSaveTimer);
      dayEditSaveTimer = setTimeout(() => {
        dayEditSaveTimer = null;
        scheduleSave(true);
      }, 600);
    });
    el.addEventListener("change", () => scheduleSave(false));
    el.addEventListener("blur", () => scheduleSave(false));
  }
}

function ensureDayEditModalDom() {
  if (dayEdit$("day-edit-modal")) return;
  const overlay = document.createElement("div");
  overlay.id = "day-edit-modal";
  overlay.className = "day-edit-modal hidden";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="day-edit-sheet">
      <div class="day-edit-head">
        <h3 id="day-edit-title">日付メモ</h3>
        <button type="button" class="day-edit-close" id="day-edit-close" aria-label="閉じる">✕</button>
      </div>
      <label class="friendly-label">日付メモ
        <textarea id="day-edit-note" rows="2" placeholder="午前は雨注意、材料発注など"></textarea>
      </label>
      <label class="friendly-label">現場不可理由
        <select id="day-edit-unavail-reason"></select>
      </label>
      <label class="friendly-label">詳細メモ
        <textarea id="day-edit-detail-memo" rows="2" placeholder="午前だけ対応可、外作業NGなど"></textarea>
      </label>
      <label class="friendly-label">予定に関する備考
        <textarea id="day-edit-event-remark" rows="2" placeholder="移動時間・持ち物・お客様への連絡事項など"></textarea>
      </label>
      <span id="day-edit-status" class="photo-title-status" aria-live="polite"></span>
      <a id="day-edit-detail-link" class="btn-sub" href="#" style="margin-top:0.5rem;display:block;text-align:center;text-decoration:none;">日程詳細を開く</a>
      <button type="button" class="btn-main" id="day-edit-done" style="margin-top:0.5rem;">完了</button>
    </div>`;
  document.body.appendChild(overlay);

  dayEdit$("day-edit-close")?.addEventListener("click", () => closeDayEditModal());
  dayEdit$("day-edit-done")?.addEventListener("click", async () => {
    try {
      await dayEditPersist({ quiet: true });
    } catch {
      /* status shown */
    }
    closeDayEditModal();
  });
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closeDayEditModal();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !dayEdit$("day-edit-modal")?.classList.contains("hidden")) {
      closeDayEditModal();
    }
  });
  if (!document.getElementById("day-edit-modal-styles")) {
    const style = document.createElement("style");
    style.id = "day-edit-modal-styles";
    style.textContent = `
      .day-edit-modal { position:fixed;inset:0;z-index:1200;background:rgba(15,23,42,0.45);display:flex;align-items:flex-end;justify-content:center;padding:0; }
      .day-edit-modal.hidden { display:none; }
      .day-edit-sheet { width:100%;max-width:520px;max-height:92vh;overflow:auto;background:#fff;border-radius:16px 16px 0 0;padding:1rem 1rem calc(1rem + env(safe-area-inset-bottom));box-shadow:0 -8px 32px rgba(0,0,0,0.15); }
      .day-edit-head { display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem; }
      .day-edit-head h3 { margin:0;font-size:1.05rem; }
      .day-edit-close { border:none;background:#f1f5f9;border-radius:8px;width:2rem;height:2rem;font-size:1rem;cursor:pointer; }
    `;
    document.head.appendChild(style);
  }
  if (!window.__dayEditIosFlushBound) {
    window.__dayEditIosFlushBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") dayEditFlushKeepalive();
    });
    window.addEventListener("pagehide", () => dayEditFlushKeepalive());
  }
}

export function initDayEditModal({ api, toast, reasonPresets = [] }) {
  ensureDayEditModalDom();
  dayEditApi = api;
  dayEditToast = toast;
  dayEditReasonPresets = reasonPresets;
  dayEditBindInputs();
}

export async function openDayEditModal(date, { onSaved, showDetailLink = true } = {}) {
  ensureDayEditModalDom();
  dayEditDate = date;
  dayEditOnSaved = onSaved ?? null;
  dayEdit$("day-edit-title").textContent = dayEditFormatDateLabel(date);
  dayEdit$("day-edit-unavail-reason").innerHTML = dayEditReasonOptions("");
  const link = dayEdit$("day-edit-detail-link");
  if (link) {
    link.href = `/schedule-v1/day?date=${encodeURIComponent(date)}`;
    link.style.display = showDetailLink ? "block" : "none";
  }
  dayEditShowStatus("読み込み中…");
  dayEdit$("day-edit-modal").classList.remove("hidden");
  try {
    const data = await dayEditApi(`/day-note?date=${encodeURIComponent(date)}`);
    dayEdit$("day-edit-note").value = data.note ?? "";
    dayEdit$("day-edit-event-remark").value = data.eventRemark ?? "";
    dayEdit$("day-edit-detail-memo").value = data.detailMemo ?? "";
    dayEdit$("day-edit-unavail-reason").innerHTML = dayEditReasonOptions(data.unavailableReason ?? "");
    dayEditLastSaved = {
      note: data.note ?? "",
      eventRemark: data.eventRemark ?? "",
      unavailableReason: data.unavailableReason ?? "",
      detailMemo: data.detailMemo ?? "",
    };
    dayEditShowStatus("");
  } catch {
    dayEditShowStatus("読み込みに失敗しました", true);
  }
}

export function closeDayEditModal() {
  dayEdit$("day-edit-modal")?.classList.add("hidden");
  dayEditDate = "";
  dayEditOnSaved = null;
}

export function renderDayMemoSummary({ memo, eventRemark, unavailable }) {
  const parts = [];
  if (memo?.trim()) {
    parts.push(`<p class="day-memo-line"><span class="day-memo-label">日付メモ</span> ${dayEditEscapeHtml(memo.trim())}</p>`);
  }
  if (unavailable?.reason) {
    parts.push(
      `<p class="day-memo-line"><span class="day-memo-label">現場不可</span> ${dayEditEscapeHtml(unavailable.reason)}${unavailable.detailMemo?.trim() ? ` — ${dayEditEscapeHtml(unavailable.detailMemo.trim())}` : ""}</p>`
    );
  }
  if (eventRemark?.trim()) {
    parts.push(
      `<p class="day-memo-line"><span class="day-memo-label">予定備考</span> ${dayEditEscapeHtml(eventRemark.trim())}</p>`
    );
  }
  if (!parts.length) {
    return '<p class="section-hint" style="margin:0;">タップして日付メモ・現場不可・備考を入力</p>';
  }
  return parts.join("");
}

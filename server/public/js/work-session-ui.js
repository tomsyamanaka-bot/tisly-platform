/** 到着・作業開始・作業完了 UI（日程詳細 / 案件詳細 / 見積 共通） */

const WORK_API = "/api/work-session/v1";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function sessionState(session) {
  if (!session) return "none";
  if (session.completionTime) return "completed";
  if (session.startTime) return "started";
  if (session.arrivalTime) return "arrived";
  return "none";
}

export function renderWorkSessionPanel({
  projectSource,
  projectId,
  projectTitle,
  workDate,
  session,
  checklist = [],
  compact = false,
}) {
  const st = sessionState(session);
  const title = projectTitle ? `<p class="work-session-title">${escapeHtml(projectTitle)}</p>` : "";
  const times = session
    ? `<p class="work-session-times section-hint">到着 ${formatTime(session.arrivalTime)} / 開始 ${formatTime(session.startTime)} / 完了 ${formatTime(session.completionTime)}</p>`
    : "";

  const arrivalBtn =
    st === "none"
      ? `<button type="button" class="btn-main work-btn-arrival" data-action="arrival">📍 現場到着</button>`
      : "";
  const startBtn =
    st === "arrived"
      ? `<button type="button" class="btn-main work-btn-start" data-action="start">🔧 作業開始</button>`
      : "";
  const completeBtn =
    st === "started"
      ? `<button type="button" class="btn-main work-btn-complete" data-action="complete">✅ 作業完了</button>`
      : "";

  const checklistHtml =
    checklist.length && !compact
      ? `<div class="work-checklist">
        <p class="section-label" style="margin:0.5rem 0 0.35rem;">完了チェック</p>
        ${checklist
          .map(
            (it) => `<label class="work-check-item">
              <input type="checkbox" data-check-id="${escapeHtml(it.id)}" ${it.checked ? "checked" : ""} />
              <span>${escapeHtml(it.category)} — ${escapeHtml(it.label)}</span>
            </label>`
          )
          .join("")}
      </div>`
      : "";

  return `<div class="work-session-panel friendly-card${compact ? " compact" : ""}"
    data-project-source="${escapeHtml(projectSource)}"
    data-project-id="${escapeHtml(projectId)}"
    data-work-date="${escapeHtml(workDate || "")}">
    ${title}
    ${times}
    <div class="work-session-actions">${arrivalBtn}${startBtn}${completeBtn}</div>
    ${checklistHtml}
  </div>`;
}

async function getGeoPosition() {
  if (!navigator.geolocation) return { lat: null, lng: null };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

export function bindWorkSessionPanels(root, { apiFetch, toast, onUpdated }) {
  if (!root) return;
  root.querySelectorAll(".work-session-panel").forEach((panel) => {
    panel.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        const projectSource = panel.dataset.projectSource;
        const projectId = panel.dataset.projectId;
        const workDate = panel.dataset.workDate || undefined;
        const body = { projectSource, projectId, workDate };
        try {
          btn.disabled = true;
          if (action === "arrival") {
            const geo = await getGeoPosition();
            Object.assign(body, { lat: geo.lat, lng: geo.lng });
            const data = await apiFetch(`${WORK_API}/arrival`, {
              method: "POST",
              body: JSON.stringify(body),
            });
            if (onUpdated) await onUpdated(data);
            toast?.("現場到着を記録しました");
          } else if (action === "start") {
            const data = await apiFetch(`${WORK_API}/start`, {
              method: "POST",
              body: JSON.stringify(body),
            });
            if (onUpdated) await onUpdated(data);
            toast?.("作業開始を記録しました");
          } else if (action === "complete") {
            let force = false;
            let forceReason = null;
            try {
              const statusQ = new URLSearchParams({ source: projectSource, projectId });
              if (workDate) statusQ.set("workDate", workDate);
              const statusData = await apiFetch(`${WORK_API}/completion-checklist/status?${statusQ.toString()}`);
              if (statusData.unchecked > 0) {
                const ok = window.confirm(
                  `未完了のチェックが${statusData.unchecked}件あります。\n${statusData.uncheckedLabels?.slice(0, 5).join("、") || ""}\n\nこのまま作業完了しますか？`
                );
                if (!ok) return;
                forceReason = window.prompt(
                  "未完了項目があります。強制完了の理由を入力してください（必須）:",
                  ""
                );
                if (!forceReason?.trim()) {
                  toast?.("強制完了には理由メモが必要です");
                  return;
                }
                force = true;
              }
            } catch {
              /* status unavailable — proceed */
            }
            const data = await apiFetch(`${WORK_API}/complete`, {
              method: "POST",
              body: JSON.stringify({ ...body, force, forceReason: forceReason?.trim() || undefined }),
            });
            if (onUpdated) await onUpdated(data);
            toast?.("作業完了を記録しました");
          }
        } catch (e) {
          toast?.(e.message || "操作に失敗しました");
        } finally {
          btn.disabled = false;
        }
      });
    });

    panel.querySelectorAll("input[data-check-id]").forEach((input) => {
      input.addEventListener("change", async () => {
        const id = input.dataset.checkId;
        try {
          await apiFetch(`${WORK_API}/completion-checklist/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ checked: input.checked }),
          });
        } catch (e) {
          input.checked = !input.checked;
          toast?.(e.message || "チェック更新に失敗しました");
        }
      });
    });
  });
}

export async function fetchWorkSession(apiFetch, { projectSource, projectId, workDate }) {
  const q = new URLSearchParams({ source: projectSource, projectId });
  if (workDate) q.set("workDate", workDate);
  return apiFetch(`${WORK_API}/session?${q.toString()}`);
}

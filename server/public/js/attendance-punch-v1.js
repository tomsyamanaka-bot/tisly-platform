/**
 * App Hub — 勤怠・入退室打刻カード v1
 * 白×navy · 出勤/退勤シミュレーション
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPunchTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", { hour12: false });
  } catch {
    return iso;
  }
}

function punchTypeLabel(type) {
  return type === "clock_in" ? "出勤" : "退勤";
}

function relayBadgeClass(status) {
  return status === "success" ? "is-ok" : "is-ng";
}

function renderAttendanceLogs(listEl, logs) {
  if (!listEl) return;
  if (!logs?.length) {
    listEl.innerHTML =
      '<li class="hub-attendance-log-empty">打刻履歴はまだありません</li>';
    return;
  }
  listEl.innerHTML = logs
    .map((row) => {
      const relay = row.relayUnlock ?? {};
      const relayCls = relayBadgeClass(relay.status);
      const relayText =
        relay.status === "success"
          ? `🔓 CH1 解錠OK（${relay.durationMs ?? 1000}ms）`
          : "⚠ 解錠失敗";
      return `<li class="hub-attendance-log-item">
        <div class="hub-attendance-log-main">
          <span class="hub-attendance-log-type is-${escapeHtml(row.punchType)}">${escapeHtml(punchTypeLabel(row.punchType))}</span>
          <strong class="hub-attendance-log-name">${escapeHtml(row.employeeName)}</strong>
        </div>
        <div class="hub-attendance-log-meta">
          <time>${escapeHtml(formatPunchTime(row.punchedAt))}</time>
          <span class="hub-attendance-relay ${relayCls}">${escapeHtml(relayText)}</span>
        </div>
      </li>`;
    })
    .join("");
}

async function fetchAttendanceLogs(getToken) {
  const token = getToken?.();
  if (!token) return [];
  const res = await fetch("/api/attendance/v1/logs?limit=30", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.logs ?? [];
}

async function postAttendancePunch(getToken, punchType) {
  const token = getToken?.();
  if (!token) {
    throw new Error("ログインが必要です");
  }
  const res = await fetch("/api/attendance/v1/punch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ punchType }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "打刻に失敗しました");
  }
  return data;
}

/**
 * App Hub 勤怠カードを初期化
 */
export function bindAttendancePunchCardV1(options = {}) {
  const getToken = options.getToken;
  const showToast = options.showToast;
  const statusEl = document.getElementById("hub-attendance-status");
  const listEl = document.getElementById("hub-attendance-log-list");
  const btnIn = document.getElementById("hub-attendance-clock-in");
  const btnOut = document.getElementById("hub-attendance-clock-out");

  if (!listEl || !btnIn || !btnOut) return;

  let busy = false;

  async function refreshLogs(message) {
    if (statusEl && message) {
      statusEl.textContent = message;
    }
    const logs = await fetchAttendanceLogs(getToken);
    renderAttendanceLogs(listEl, logs);
    if (statusEl && !message) {
      statusEl.textContent = logs.length
        ? `最新 ${logs.length} 件を表示中`
        : "打刻履歴はまだありません";
    }
  }

  async function handlePunch(punchType) {
    if (busy) return;
    busy = true;
    btnIn.disabled = true;
    btnOut.disabled = true;
    if (statusEl) {
      statusEl.textContent =
        punchType === "clock_in" ? "出勤打刻を送信中…" : "退勤打刻を送信中…";
    }
    try {
      const data = await postAttendancePunch(getToken, punchType);
      renderAttendanceLogs(listEl, data.logs ?? []);
      const label = punchTypeLabel(punchType);
      const relay = data.log?.relayUnlock;
      const relayMsg =
        relay?.status === "success" ? " · CH1 解錠OK" : " · 解錠失敗";
      if (statusEl) {
        statusEl.textContent = `${label}打刻を記録しました${relayMsg}`;
      }
      showToast?.(`${label}打刻を記録しました${relayMsg}`);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "打刻に失敗しました";
      if (statusEl) statusEl.textContent = msg;
      showToast?.(msg);
    } finally {
      busy = false;
      btnIn.disabled = false;
      btnOut.disabled = false;
    }
  }

  btnIn.addEventListener("click", () => handlePunch("clock_in"));
  btnOut.addEventListener("click", () => handlePunch("clock_out"));

  void refreshLogs();
}

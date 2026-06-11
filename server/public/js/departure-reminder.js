/** 出発30分前リマインダー — ブラウザ通知 + 画面内アラート（iPhone PWA フォールバック） */

const PERM_KEY = "tisly_departure_notify_asked";
const FIRED_KEY = "tisly_departure_fired";

let pollTimer = null;
let activeDeparture = null;

export function notificationsSupported() {
  return typeof Notification !== "undefined";
}

export function notificationsUsable() {
  return notificationsSupported() && Notification.permission === "granted";
}

export async function requestNotificationPermissionOnce() {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  if (localStorage.getItem(PERM_KEY) === "1") return Notification.permission;
  localStorage.setItem(PERM_KEY, "1");
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseTodayMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

function minutesUntilReminder(departure) {
  if (!departure?.reminderEnabled) return null;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const target = parseTodayMinutes(departure.reminderTime);
  return target - nowMin;
}

function firedKey(departure) {
  return `${FIRED_KEY}:${departure.date}:${departure.id}`;
}

function alreadyFired(departure) {
  return sessionStorage.getItem(firedKey(departure)) === "1";
}

function markFired(departure) {
  sessionStorage.setItem(firedKey(departure), "1");
}

export function buildFieldCheckHref(departure) {
  if (departure?.fieldCheckUrl) return departure.fieldCheckUrl;
  if (departure?.projectId && departure?.projectSource) {
    const q = new URLSearchParams({
      projectId: departure.projectId,
      source: departure.projectSource,
      date: departure.date,
    });
    return `/field-check-v1?${q.toString()}`;
  }
  return `/schedule-day-v1?date=${departure?.date ?? todayIso()}`;
}

export async function showDepartureNotification(departure, payload) {
  const title = payload?.title ?? "🚐 出発準備";
  const body = payload?.body ?? "持ち物を確認してください。";
  const url = payload?.url ?? buildFieldCheckHref(departure);

  if (notificationsUsable()) {
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body,
          icon: "/icons/icon-192.png?v=2001",
          badge: "/icons/icon-192.png?v=2001",
          data: { url },
          tag: `departure-${departure.id}`,
        });
        markFired(departure);
        return "notification";
      }
      const n = new Notification(title, { body, tag: `departure-${departure.id}` });
      n.onclick = () => {
        window.focus();
        window.location.href = url;
      };
      markFired(departure);
      return "notification";
    } catch {
      /* fall through to alert card */
    }
  }
  return "alert";
}

export function renderDepartureAlertCard(departure, { onOpenKit } = {}) {
  if (!departure?.reminderEnabled || departure.date !== todayIso()) return "";
  const mins = minutesUntilReminder(departure);
  if (mins == null) return "";
  const show = mins <= 30 && mins >= -120;
  if (!show) return "";
  const site = departure.eventTitle ? `「${departure.eventTitle}」` : "";
  const href = buildFieldCheckHref(departure);
  return `<div class="departure-alert-card" role="alert">
    <p class="departure-alert-title">🔔 ${departure.reminderTime} 持ち物確認</p>
    <p class="departure-alert-body">出発 ${departure.departureTime}${site ? ` — ${site}` : ""}</p>
    <a class="btn-sub btn-small departure-alert-btn" href="${href}" data-departure-open="1">持ち物リストを開く</a>
  </div>`;
}

export function bindDepartureAlertCards(root) {
  root?.querySelectorAll("[data-departure-open]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
    });
  });
}

function shouldFireNow(departure) {
  if (!departure?.reminderEnabled || departure.date !== todayIso()) return false;
  if (alreadyFired(departure)) return false;
  const mins = minutesUntilReminder(departure);
  return mins != null && mins <= 0 && mins >= -5;
}

async function tickDepartureReminder(apiFetch) {
  if (!activeDeparture) return;
  if (!shouldFireNow(activeDeparture)) return;
  let payload = null;
  try {
    const data = await apiFetch(`/departures/${activeDeparture.id}/test-notify`, { method: "POST" });
    payload = data.notification;
  } catch {
    payload = {
      title: "🚐 出発準備",
      body: `今日の最初の現場「${activeDeparture.eventTitle ?? "現場"}」\n持ち物を確認してください。`,
      url: buildFieldCheckHref(activeDeparture),
    };
  }
  const mode = await showDepartureNotification(activeDeparture, payload);
  if (mode === "alert") {
    const mount = document.getElementById("departure-alert-mount");
    if (mount) {
      mount.innerHTML = renderDepartureAlertCard(activeDeparture);
      bindDepartureAlertCards(mount);
      mount.classList.remove("hidden");
    }
  }
}

export function startDepartureReminderPolling(departure, apiFetch) {
  activeDeparture = departure;
  if (pollTimer) clearInterval(pollTimer);
  if (!departure?.reminderEnabled) return;
  tickDepartureReminder(apiFetch).catch(() => {});
  pollTimer = setInterval(() => tickDepartureReminder(apiFetch).catch(() => {}), 30_000);
}

export function stopDepartureReminderPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  activeDeparture = null;
}

export function renderDeparturePrepHtml(departure, { compact = false } = {}) {
  if (!departure) return "";
  const toggleLabel = departure.reminderEnabled ? "ON" : "OFF";
  const kitHref = buildFieldCheckHref(departure);
  if (compact) {
    return `<div class="departure-compact">
      <span>🚐 出発 ${departure.departureTime}</span>
      <span>🔔 ${departure.reminderTime}</span>
      <a class="btn-sub btn-small" href="${kitHref}">持ち物</a>
    </div>`;
  }
  return `<div class="departure-prep-card friendly-card" data-departure-id="${departure.id}">
    <p class="section-label" style="margin-top:0;">🚐 出発準備</p>
    <p>出発時間 <strong>${departure.departureTime}</strong></p>
    <p>通知 <strong>${departure.reminderTime}</strong> <span class="departure-remind-badge">${toggleLabel}</span></p>
    <div class="departure-prep-actions">
      <button type="button" class="btn-sub btn-small" data-departure-edit="1">出発時間を変更</button>
      <button type="button" class="btn-sub btn-small" data-departure-toggle="1">通知 ${toggleLabel}</button>
      <a class="btn-sub btn-small" href="${kitHref}">持ち物リストを開く</a>
    </div>
  </div>`;
}

export function openDepartureEditDialog(departure, { apiFetch, onSaved, toast }) {
  const current = departure.departureTime ?? "07:00";
  const next = window.prompt(
    `出発時間（HH:MM）\n例: 07:45\n\n通知: 出発${departure.reminderMinutesBefore ?? 30}分前`,
    current
  );
  if (!next || !/^\d{2}:\d{2}$/.test(next)) return;
  apiFetch(`/departures/${departure.id}`, {
    method: "PATCH",
    body: JSON.stringify({ departureTime: next }),
  })
    .then((saved) => {
      toast?.("出発時間を保存しました");
      onSaved?.(saved);
    })
    .catch((e) => toast?.(e.message || "保存に失敗しました"));
}

export function toggleDepartureReminder(departure, { apiFetch, onSaved, toast }) {
  apiFetch(`/departures/${departure.id}`, {
    method: "PATCH",
    body: JSON.stringify({ reminderEnabled: !departure.reminderEnabled }),
  })
    .then((saved) => {
      toast?.(saved.reminderEnabled ? "通知をONにしました" : "通知をOFFにしました");
      onSaved?.(saved);
    })
    .catch((e) => toast?.(e.message || "保存に失敗しました"));
}

export function bindDeparturePrepCards(root, departuresById, { apiFetch, onSaved, toast }) {
  root?.querySelectorAll("[data-departure-edit]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const card = btn.closest("[data-departure-id]");
      const id = card?.dataset?.departureId;
      const departure = id ? departuresById?.[id] : null;
      if (!departure) return;
      openDepartureEditDialog(departure, { apiFetch, onSaved, toast });
    });
  });
  root?.querySelectorAll("[data-departure-toggle]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const card = btn.closest("[data-departure-id]");
      const id = card?.dataset?.departureId;
      const departure = id ? departuresById?.[id] : null;
      if (!departure) return;
      toggleDepartureReminder(departure, { apiFetch, onSaved, toast });
    });
  });
}

export async function initDepartureReminderClient({ apiFetch, toast, departure }) {
  await requestNotificationPermissionOnce();
  if (departure) {
    startDepartureReminderPolling(departure, apiFetch);
    const mount = document.getElementById("departure-alert-mount");
    if (mount && !notificationsUsable()) {
      const html = renderDepartureAlertCard(departure);
      if (html) {
        mount.innerHTML = html;
        bindDepartureAlertCards(mount);
        mount.classList.remove("hidden");
      }
    }
  }
}

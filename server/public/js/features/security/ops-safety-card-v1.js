/**
 * 社内画面だけの点検中カード。
 * お客様画面には出さない。
 */

let bound = false;
let currentSiteId = "";
let notifyItabashi = false;
let endpointSynced = false;

function text(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function paintNotify(data) {
  const notify = data?.notify;
  const site = document.getElementById("sf-staff-notify-site");
  if (site) site.textContent = `対象: ${data?.siteName || "選択中の物件"}`;
  const status = document.getElementById("sf-staff-notify-status");
  if (status) {
    status.textContent = notify?.statusLabel || "—";
    status.classList.remove("is-on", "is-work", "is-off");
    status.classList.add(
      notify?.statusTone === "on"
        ? "is-on"
        : notify?.statusTone === "work"
          ? "is-work"
          : "is-off"
    );
  }
  const hint = document.getElementById("sf-staff-notify-hint");
  if (hint) hint.textContent = notify?.hint || "";
  const work = document.getElementById("sf-staff-notify-work");
  if (work) work.hidden = notify ? notify.showWorkTimer === false : false;
  const always = document.getElementById("sf-staff-notify-always");
  const alwaysLabel = document.getElementById("sf-staff-notify-always-label");
  if (alwaysLabel && notify?.alwaysLabel) {
    alwaysLabel.textContent = notify.alwaysLabel;
  }
  if (always && notify) always.checked = Boolean(notify.alwaysChecked);
  const critical = document.getElementById("sf-staff-notify-critical");
  if (critical && notify) critical.checked = notify.criticalEnabled !== false;
  notifyItabashi = Boolean(notify?.itabashi);
}

function paint(data) {
  const name = data?.siteName || "選択中の物件";
  text("sf-ops-safety-site", `対象: ${name}`);
  const banner = data?.maintenance?.active
    ? data.maintenance.banner
    : "監視中";
  text("sf-ops-safety-banner", banner || "監視中");
  const health = data?.health;
  const uptime = health?.uptimeLabel || "—";
  const reset = health?.resetLabel || "未取得";
  text("sf-ops-uptime", `連続稼働時間: ${uptime}`);
  const resetHost = document.getElementById("sf-ops-reset");
  if (resetHost) {
    if (health?.badge) {
      resetHost.innerHTML =
        `前回起動理由: ${reset} ` +
        `<span class="sf-ops-badge is-caution">${health.badge}</span>`;
    } else {
      resetHost.textContent = `前回起動理由: ${reset}`;
    }
  }
  const temp = data?.cabinet;
  const host = document.getElementById("sf-ops-safety-temp");
  if (!host) return;
  const label =
    temp?.tempC == null ? "盤内温度: —" : `盤内温度: ${Number(temp.tempC).toFixed(1)}℃`;
  if (temp?.badge) {
    const tone = temp.badgeTone === "danger" ? "is-danger" : "is-caution";
    host.innerHTML =
      `${label} <span class="sf-ops-badge ${tone}">${temp.badge}</span>`;
  } else {
    host.textContent = label;
  }
  paintNotify(data);
}

export async function refreshOpsSafetyCardV1(siteId) {
  currentSiteId = String(siteId || currentSiteId || "").trim();
  if (!document.getElementById("sf-ops-safety")) return;
  if (!currentSiteId) {
    paint(null);
    return;
  }
  const url =
    "/api/home/v1/ops-safety?siteId=" +
    encodeURIComponent(currentSiteId);
  const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  const data = await res.json();
  if (data?.ok) paint(data);
  void syncStaffEndpointOnce();
}

async function postMinutes(minutes) {
  if (!currentSiteId) return;
  const res = await fetch("/api/home/v1/ops-safety/maintenance", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId: currentSiteId, minutes }),
  });
  const data = await res.json();
  if (data?.ok) paint(data);
}

async function readPushEndpoint() {
  if (!("serviceWorker" in navigator)) return "";
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const sub = await reg.pushManager?.getSubscription();
      if (sub?.endpoint) return sub.endpoint;
    }
  } catch {
    /* 購読を読めない端末は同期しない */
  }
  return "";
}

function paintSyncNote(data) {
  const note = document.getElementById("sf-staff-notify-sync-note");
  if (!note) return;
  const removed = Number(data?.shadowRemoved || 0);
  note.textContent =
    removed > 0 ? "この端末の顧客テスト購読を整理しました。" : "";
}

async function postNotify(body) {
  if (!currentSiteId) return;
  if (document.body.classList.contains("sf-customer")) return;
  const endpoint = await readPushEndpoint();
  const res = await fetch("/api/home/v1/staff-notify", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId: currentSiteId, endpoint, ...body }),
  });
  const data = await res.json();
  if (data?.ok) {
    paint(data);
    paintSyncNote(data);
  }
}

async function syncStaffEndpointOnce() {
  if (endpointSynced) return;
  if (document.body.classList.contains("sf-customer")) return;
  if (!document.getElementById("sf-staff-notify")) return;
  if (!currentSiteId) return;
  const endpoint = await readPushEndpoint();
  if (!endpoint) return;
  endpointSynced = true;
  await postNotify({ kind: "sync" });
}

function bindOpsSafetyCardV1() {
  if (bound) return;
  const root = document.getElementById("sf-ops-safety");
  if (!root) return;
  bound = true;
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ops-minutes]");
    if (!button) return;
    const minutes = Number(button.getAttribute("data-ops-minutes"));
    void postMinutes(minutes);
  });
  const notify = document.getElementById("sf-staff-notify");
  notify?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-staff-minutes]");
    if (!button) return;
    const minutes = Number(button.getAttribute("data-staff-minutes"));
    void postNotify({ kind: "temp", minutes });
  });
  document.getElementById("sf-staff-notify-always")?.addEventListener(
    "change",
    (event) => {
      const checked = Boolean(event.target?.checked);
      const value = notifyItabashi
        ? checked
          ? false
          : null
        : checked
          ? true
          : null;
      void postNotify({ kind: "normalAlways", value });
    }
  );
  document.getElementById("sf-staff-notify-sync")?.addEventListener(
    "click",
    () => {
      endpointSynced = true;
      void postNotify({ kind: "sync" });
    }
  );
  document.getElementById("sf-staff-notify-critical")?.addEventListener(
    "change",
    (event) => {
      void postNotify({
        kind: "critical",
        enabled: Boolean(event.target?.checked),
      });
    }
  );
  window.setInterval(() => {
    void refreshOpsSafetyCardV1(currentSiteId);
  }, 30000);
}

bindOpsSafetyCardV1();

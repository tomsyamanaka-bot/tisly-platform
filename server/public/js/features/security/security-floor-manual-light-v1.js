/**
 * TiSLY Security — 手動ライト遠隔操作 v1
 * /api/home/v1/control (target=security_light)
 */

import { resolveHomeSiteId } from "./security-floor-remote-config-v1.js";

const HOME_API = "/api/home/v1";

const LIGHT_ACTIONS = [
  {
    group: "24v",
    label: "💡 外側100V 防犯ライト (DO2 / GPIO18)",
    buttons: [
      { action: "light_24v_on", label: "点灯", style: "is-on" },
      { action: "light_24v_off", label: "消灯", style: "" },
      { action: "light_24v_strobe", label: "威嚇点滅", style: "is-warn" },
    ],
  },
  {
    group: "100v",
    label: "💡 100V 投光器ライト (DO3 / GPIO19)",
    buttons: [
      { action: "light_100v_on", label: "点灯", style: "is-on" },
      { action: "light_100v_off", label: "消灯", style: "" },
    ],
  },
];

function $(id) {
  return document.getElementById(id);
}

function showToast(message) {
  let el = $("sf-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "sf-toast";
    el.className = "sf-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.classList.remove("is-visible");
  }, 3200);
}

function homeSiteId() {
  const sel = $("sf-site-select");
  return resolveHomeSiteId((sel && sel.value) || "SEC-JP-MORIYA-001");
}

async function sendLightCommand(action, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${HOME_API}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: homeSiteId(),
        target: "security_light",
        action,
        actor: "security-v1",
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "送信に失敗しました");
    showToast(data.message || "実機へ命令を送信しました");
  } catch (err) {
    showToast(err.message || "送信に失敗しました");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bindManualLightUi() {
  if (window.__TISLY_SF_MANUAL_LIGHT_BOUND) return;
  window.__TISLY_SF_MANUAL_LIGHT_BOUND = true;

  $("sf-light-all-on")?.addEventListener("click", (e) => {
    sendLightCommand("light_all_on", e.currentTarget);
  });
  $("sf-light-all-off")?.addEventListener("click", (e) => {
    sendLightCommand("light_all_off", e.currentTarget);
  });

  document.querySelectorAll("[data-sf-light-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sendLightCommand(btn.dataset.sfLightAction, btn);
    });
  });
}

export function mountSecurityManualLightPanelV1() {
  const root = $("sf-manual-light-actions");
  if (!root || root.dataset.mounted === "1") {
    bindManualLightUi();
    return;
  }
  root.dataset.mounted = "1";
  root.innerHTML = LIGHT_ACTIONS.map(
    (group) => `
      <div class="sf-manual-light-group" data-group="${group.group}">
        <p class="sf-remote-label">${group.label}</p>
        <div class="sf-manual-light-row">
          ${group.buttons
            .map(
              (b) =>
                `<button type="button" class="sf-manual-light-btn ${b.style}" data-sf-light-action="${b.action}">${b.label}</button>`
            )
            .join("")}
        </div>
      </div>`
  ).join("");
  bindManualLightUi();
}

mountSecurityManualLightPanelV1();

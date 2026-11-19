/**
 * 社内画面だけの点検中カード。
 * お客様画面には出さない。
 */

let bound = false;
let currentSiteId = "";

function text(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
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
  window.setInterval(() => {
    void refreshOpsSafetyCardV1(currentSiteId);
  }, 30000);
}

bindOpsSafetyCardV1();

import {
  escapeHtml,
  renderMonitoringAlert,
  renderMonitoringFloors,
  renderMonitoringLogs,
  scrollToFloorAndBlink,
} from "./customer-shared-v1.js";
import { goCustomerBack, initCustomerPage, setCustomerReturnUrl } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");
const shareId = decodeURIComponent(location.pathname.split("/").filter(Boolean)[2] || "");
const view = new URLSearchParams(location.search).get("view") || "all";

initCustomerPage();
document.getElementById("btn-back")?.addEventListener("click", () => {
  goCustomerBack({ shareId });
});

async function load() {
  const res = await fetch(`/api/customer-portal/v1/monitoring/${encodeURIComponent(shareId)}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    main.innerHTML = `<p class="cv-preparing">${escapeHtml(data.error || "確認中です")}</p>`;
    return;
  }

  document.getElementById("page-title").textContent = data.propertyName;
  document.getElementById("page-subtitle").textContent = `${data.systemStatusEmoji} ${data.systemStatusLabel}`;

  const showFloors = view === "all" || view === "camera" || !view;
  const showAlerts = view === "all" || view === "alerts";
  const showNotifications = view === "all" || view === "notifications";

  const cameraFloors = showFloors
    ? data.floors.map((f) => ({
        ...f,
        sensors: view === "camera" ? f.sensors.filter((s) => s.isCamera) : f.sensors,
      }))
    : [];

  const highlightId = data.activeAlert?.highlightSensorId ?? null;

  main.innerHTML = `
    ${renderMonitoringAlert(data.activeAlert)}
    ${
      data.noActiveIssues && view === "all"
        ? `<section class="cv-card cv-all-ok"><p class="cv-all-ok-text">✅ ${escapeHtml(data.emptyMessage)}</p></section>`
        : ""
    }
  ${
    showFloors
      ? `<div class="cv-floors">${renderMonitoringFloors(cameraFloors, highlightId)}</div>`
      : ""
  }
    ${
      showAlerts
        ? `<section class="cv-card" id="alerts"><h2>警報履歴</h2>${renderMonitoringLogs(data.alertLogs, "警報履歴")}</section>`
        : ""
    }
    ${
      showNotifications
        ? `<section class="cv-card" id="notifications"><h2>通知履歴</h2>${renderMonitoringLogs(data.notificationLogs, "通知履歴")}</section>`
        : ""
    }
    <p class="cv-last-checked cv-footer-note">最終確認：${escapeHtml(data.lastCheckedAt)}</p>
  `;

  if (data.activeAlert) {
    requestAnimationFrame(() => {
      scrollToFloorAndBlink(data.activeAlert.floorId, data.activeAlert.highlightSensorId);
    });
  }
}

setCustomerReturnUrl(`/customer/project/${encodeURIComponent(shareId)}`);
load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

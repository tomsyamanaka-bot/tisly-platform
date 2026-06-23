import {
  escapeHtml,
  CUSTOMER_MONITORING_LABELS,
  renderMonitoringAlert,
  renderMonitoringFloors,
  renderMonitoringLogs,
  scrollToFloorAndBlink,
  findHighlightKey,
} from "./customer-shared-v1.js";
import { goCustomerBack, initCustomerPage, setCustomerReturnUrl } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");
const shareId = decodeURIComponent(location.pathname.split("/").filter(Boolean)[2] || "");
const view = new URLSearchParams(location.search).get("view") || "all";

initCustomerPage();
document.getElementById("btn-back")?.addEventListener("click", () => {
  goCustomerBack({ shareId });
});

function wireContactButton(contactTelHref, contactLabel) {
  const bottomBar = document.querySelector(".cv-bottom-bar");
  if (!bottomBar || !contactTelHref) return;
  bottomBar.innerHTML = `
    <button type="button" class="cv-btn secondary" id="btn-back">戻る</button>
    <a class="cv-btn" href="${escapeHtml(contactTelHref)}" data-tel-action="1">📞 ${escapeHtml(contactLabel)}</a>
  `;
  document.getElementById("btn-back")?.addEventListener("click", () => {
    goCustomerBack({ shareId });
  });
}

async function load() {
  const res = await fetch(`/api/customer-portal/v1/monitoring/${encodeURIComponent(shareId)}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    main.innerHTML = `<p class="cv-preparing">${escapeHtml(data.error || "確認中です")}</p>`;
    return;
  }

  const pageTitle = data.pageTitle || CUSTOMER_MONITORING_LABELS.pageTitle;
  document.getElementById("page-title").textContent = pageTitle;
  document.getElementById("page-subtitle").textContent = data.propertyName || "";

  const showFloors = view === "all" || view === "camera" || !view;
  const showAlerts = view === "all" || view === "alerts";
  const lastDetectionLabel = data.lastDetectionLabel || CUSTOMER_MONITORING_LABELS.lastDetection;
  const alertLabel = data.alertHistoryLabel || CUSTOMER_MONITORING_LABELS.alertHistory;
  const emptyMessage = data.emptyMessage || CUSTOMER_MONITORING_LABELS.allClear;

  const cameraFloors = showFloors
    ? data.floors.map((f) => ({
        ...f,
        sensors: view === "camera" ? f.sensors.filter((s) => s.isCamera) : f.sensors,
      }))
    : [];

  const highlightKey = findHighlightKey(
    data.floors,
    data.activeAlert?.highlightSensorId,
    data.activeAlert?.sensorName
  );

  main.innerHTML = `
    ${renderMonitoringAlert(data.activeAlert)}
    ${
      data.noActiveIssues && view === "all"
        ? `<section class="cv-card cv-all-ok"><p class="cv-all-ok-text">✅ ${escapeHtml(emptyMessage)}</p></section>`
        : ""
    }
    ${showFloors ? renderMonitoringFloors(cameraFloors, highlightKey) : ""}
    ${
      showAlerts
        ? `<section class="cv-card" id="alerts"><h2>${escapeHtml(alertLabel)}</h2>${renderMonitoringLogs(data.alertLogs)}</section>`
        : ""
    }
    <p class="cv-last-checked cv-footer-note">${escapeHtml(lastDetectionLabel)}：${escapeHtml(data.lastCheckedAt)}</p>
  `;

  wireContactButton(data.contactTelHref, data.contactLabel);

  if (data.activeAlert) {
    requestAnimationFrame(() => {
      scrollToFloorAndBlink(data.activeAlert.floorId, highlightKey);
    });
  }
}

setCustomerReturnUrl(`/customer/project/${encodeURIComponent(shareId)}`);
load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

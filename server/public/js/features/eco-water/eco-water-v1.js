/**
 * TiSLY Eco-Water ダッシュボード本体
 * ステータス / グラフ / デモ / 証明書モーダル
 */

import {
  applyAlkalineSpikeV1,
  buildCertificatePayloadV1,
  createEcoWaterSimStateV1,
  ECO_WATER_DEFAULT_PH,
  resolvePhStatusLabelV1,
  sha256HexV1,
  startNeutralizeV1,
  stepNeutralizeV1,
} from "./eco-water-sim-v1.js";
import { createEcoWaterChartV1 } from "./eco-water-chart-v1.js";

const SITE = {
  companyName: "株式会社TOMS",
  siteName: "守谷生コンプラント / 排水ピット A",
  calibrationDate: "2026/08/01",
};

/** @type {ReturnType<typeof createEcoWaterSimStateV1>} */
let state = createEcoWaterSimStateV1();
/** @type {ReturnType<typeof createEcoWaterChartV1> | null} */
let chart = null;
/** @type {number | null} */
let tickTimer = null;
/** @type {number | null} */
let neutralizeTimer = null;

const els = {
  phDisplay: document.getElementById("ew-ph-display"),
  badge: document.getElementById("ew-status-badge"),
  statusCard: document.querySelector(".ew-status-card"),
  valve: document.getElementById("ew-valve-indicator"),
  valveText: document.getElementById("ew-valve-text"),
  demoStatus: document.getElementById("ew-demo-status"),
  btnAlkaline: document.getElementById("ew-btn-alkaline"),
  btnNeutralize: document.getElementById("ew-btn-neutralize"),
  btnReset: document.getElementById("ew-btn-reset"),
  btnCert: document.getElementById("ew-btn-cert"),
  modal: document.getElementById("ew-cert-modal"),
  modalClose: document.getElementById("ew-modal-close"),
  modalBackdrop: document.getElementById("ew-modal-backdrop"),
  modalPrint: document.getElementById("ew-modal-print"),
  backLink: document.getElementById("ew-back-link"),
  certCompany: document.getElementById("ew-cert-company"),
  certSite: document.getElementById("ew-cert-site"),
  certMeasured: document.getElementById("ew-cert-measured"),
  certBefore: document.getElementById("ew-cert-before"),
  certAfter: document.getElementById("ew-cert-after"),
  certCalib: document.getElementById("ew-cert-calib"),
  certHash: document.getElementById("ew-cert-hash"),
};

function renderState() {
  if (els.phDisplay) {
    els.phDisplay.textContent = state.ph.toFixed(1);
  }
  const status = resolvePhStatusLabelV1(state.ph);
  if (els.badge) {
    els.badge.textContent = status.label;
    els.badge.className =
      status.kind === "safe"
        ? "ew-badge ew-badge-safe"
        : "ew-badge ew-badge-danger";
  }
  if (els.statusCard) {
    els.statusCard.classList.toggle("is-safe", status.kind === "safe");
    els.statusCard.classList.toggle("is-danger", status.kind !== "safe");
  }
  if (els.valve && els.valveText) {
    els.valve.className = state.valveOpen
      ? "ew-valve ew-valve-open"
      : "ew-valve ew-valve-closed";
    els.valveText.textContent = state.valveOpen ? "バルブ開" : "バルブ閉";
    els.valve.setAttribute(
      "aria-label",
      state.valveOpen ? "バルブ開" : "バルブ閉"
    );
  }
  if (els.demoStatus) {
    els.demoStatus.textContent = state.statusMessage;
  }
  const busy = state.phase === "neutralizing";
  if (els.btnAlkaline) els.btnAlkaline.disabled = busy;
  if (els.btnNeutralize) els.btnNeutralize.disabled = busy;
}

function clearNeutralizeTimer() {
  if (neutralizeTimer != null) {
    clearInterval(neutralizeTimer);
    neutralizeTimer = null;
  }
}

function onAlkaline() {
  clearNeutralizeTimer();
  state = applyAlkalineSpikeV1(state);
  chart?.push(state.ph);
  renderState();
}

function onNeutralize() {
  if (state.phase === "neutralizing") return;
  if (state.ph < 8.6 && state.phase === "idle") {
    state = applyAlkalineSpikeV1(state);
  }
  state = startNeutralizeV1(state);
  chart?.push(state.ph);
  renderState();
  clearNeutralizeTimer();
  neutralizeTimer = window.setInterval(() => {
    state = stepNeutralizeV1(state, 0.22);
    chart?.push(state.ph);
    renderState();
    if (state.phase === "complete") {
      clearNeutralizeTimer();
    }
  }, 450);
}

function onReset() {
  clearNeutralizeTimer();
  state = createEcoWaterSimStateV1();
  chart?.push(state.ph);
  renderState();
}

async function openCertificate() {
  const measuredAt = new Date().toLocaleString("ja-JP", { hour12: false });
  const phBefore =
    state.phBefore ??
    (state.ph > ECO_WATER_DEFAULT_PH + 0.2 ? state.ph : 12.3);
  const phAfter = state.phAfter ?? state.ph;
  const payload = {
    companyName: SITE.companyName,
    siteName: SITE.siteName,
    measuredAt,
    phBefore: Number(phBefore).toFixed(1),
    phAfter: Number(phAfter).toFixed(1),
    calibrationDate: SITE.calibrationDate,
  };
  const raw = buildCertificatePayloadV1(payload);
  const hash = await sha256HexV1(raw);
  const hashId = `EW-${hash.slice(0, 16).toUpperCase()}`;

  if (els.certCompany) els.certCompany.textContent = payload.companyName;
  if (els.certSite) els.certSite.textContent = payload.siteName;
  if (els.certMeasured) els.certMeasured.textContent = payload.measuredAt;
  if (els.certBefore) els.certBefore.textContent = payload.phBefore;
  if (els.certAfter) els.certAfter.textContent = payload.phAfter;
  if (els.certCalib) els.certCalib.textContent = payload.calibrationDate;
  if (els.certHash) els.certHash.textContent = hashId;
  if (els.modal) els.modal.hidden = false;
}

function closeCertificate() {
  if (els.modal) els.modal.hidden = true;
}

function bindEvents() {
  els.btnAlkaline?.addEventListener("click", onAlkaline);
  els.btnNeutralize?.addEventListener("click", onNeutralize);
  els.btnReset?.addEventListener("click", onReset);
  els.btnCert?.addEventListener("click", () => {
    void openCertificate();
  });
  els.modalClose?.addEventListener("click", closeCertificate);
  els.modalBackdrop?.addEventListener("click", closeCertificate);
  els.modalPrint?.addEventListener("click", () => {
    window.print();
  });
}

function configureBackLink() {
  const path = location.pathname || "";
  const isCustomer = path.startsWith("/customer");
  if (els.backLink) {
    if (isCustomer) {
      els.backLink.href = "/customer";
      els.backLink.textContent = "← お客様へ戻る";
    } else {
      els.backLink.href = "/app";
      els.backLink.textContent = "← アプリ一覧へ戻る";
    }
  }
  // お客様画面では社内向け文言を出さない
  const footer = document.querySelector(".ew-footer-nav");
  if (footer && isCustomer) {
    footer.innerHTML = `
      <a href="/customer">お客様ホーム</a>
      <a href="/customer/eco-water">水質</a>
      <a href="tel:048-594-7077">TOMSへ連絡</a>
    `;
  }
}

function boot() {
  configureBackLink();
  const canvas = document.getElementById("ew-ph-chart");
  const startChart = () => {
    if (canvas instanceof HTMLCanvasElement) {
      chart = createEcoWaterChartV1(canvas, state.ph);
    }
  };
  if (globalThis.Chart) {
    startChart();
  } else {
    window.addEventListener("load", startChart, { once: true });
  }
  bindEvents();
  renderState();
  // アイドル時もわずかに揺らぎを入れてライブ感を出す
  tickTimer = window.setInterval(() => {
    if (state.phase === "neutralizing") return;
    const drift =
      state.phase === "idle"
        ? (Math.random() - 0.5) * 0.04
        : 0;
    const next = Number((state.ph + drift).toFixed(2));
    state = { ...state, ph: next };
    chart?.push(state.ph);
    if (state.phase === "idle") renderState();
  }, 2000);
}

boot();

window.addEventListener("beforeunload", () => {
  clearNeutralizeTimer();
  if (tickTimer != null) clearInterval(tickTimer);
  chart?.destroy();
});

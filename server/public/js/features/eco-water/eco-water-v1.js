/**
 * TiSLY Eco-Water ダッシュボード本体
 * ステータス / グラフ / デモ / 証明書モーダル
 * 複数現場切替・中和履歴を追記拡張
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
import {
  ECO_WATER_DEFAULT_SITE_ID_V1,
  findEcoWaterSiteV1,
  formatEcoWaterHashIdV1,
  listEcoWaterSitesV1,
} from "./eco-water-sites-v1.js";
import {
  createNeutralizeHistoryEntryV1,
  loadNeutralizeHistoryV1,
  loadSelectedSiteIdV1,
  prependNeutralizeHistoryV1,
  saveNeutralizeHistoryV1,
  saveSelectedSiteIdV1,
} from "./eco-water-history-v1.js";

/** @deprecated 互換用 — 現場カタログへ移行済み */
const SITE = {
  companyName: "株式会社TOMS",
  siteName: "守谷生コンプラント / 排水ピット A",
  calibrationDate: "2026/08/01",
};

/** @type {ReturnType<typeof findEcoWaterSiteV1>} */
let currentSite = findEcoWaterSiteV1(ECO_WATER_DEFAULT_SITE_ID_V1);

/** @type {ReturnType<typeof createEcoWaterSimStateV1>} */
let state = createEcoWaterSimStateV1();
/** @type {ReturnType<typeof createEcoWaterChartV1> | null} */
let chart = null;
/** @type {number | null} */
let tickTimer = null;
/** @type {number | null} */
let neutralizeTimer = null;
/** @type {boolean} */
let wasValveOpen = false;
/** @type {number | null} */
let valveCloseAnimTimer = null;
/** @type {object[]} */
let historyList = [];
/** 中和完了時の二重追記防止 */
let lastLoggedCompleteKey = "";

const storage =
  typeof localStorage !== "undefined" ? localStorage : null;

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
  siteSelect: document.getElementById("ew-site-select"),
  siteLine: document.getElementById("ew-site-line"),
  metaSiteName: document.getElementById("ew-meta-site-name"),
  metaPhStatus: document.getElementById("ew-meta-ph-status"),
  metaCalib: document.getElementById("ew-meta-calib"),
  metaHashPrefix: document.getElementById("ew-meta-hash-prefix"),
  maintNextCalib: document.getElementById("ew-maint-next-calib"),
  historyList: document.getElementById("ew-history-list"),
  historyEmpty: document.getElementById("ew-history-empty"),
};

/**
 * CO₂バルブ表示を更新
 * 開→閉の瞬間は closing クラスで自然に切替
 */
function renderValve() {
  if (!els.valve || !els.valveText) return;
  const open = state.valveOpen;
  const justClosed = wasValveOpen && !open;
  if (valveCloseAnimTimer != null) {
    clearTimeout(valveCloseAnimTimer);
    valveCloseAnimTimer = null;
  }
  if (justClosed) {
    els.valve.className = "ew-valve ew-valve-closed ew-valve-closing";
    els.valveText.textContent = "バルブ閉";
    els.valve.setAttribute("aria-label", "バルブ閉");
    valveCloseAnimTimer = window.setTimeout(() => {
      if (els.valve && !state.valveOpen) {
        els.valve.className = "ew-valve ew-valve-closed";
      }
      valveCloseAnimTimer = null;
    }, 380);
  } else {
    els.valve.className = open
      ? "ew-valve ew-valve-open"
      : "ew-valve ew-valve-closed";
    els.valveText.textContent = open ? "バルブ開" : "バルブ閉";
    els.valve.setAttribute(
      "aria-label",
      open ? "バルブ開" : "バルブ閉"
    );
  }
  wasValveOpen = open;
}

/**
 * 現場メタ（名前・校正・Prefix）を反映
 * 既存ステータスカードと同期する
 */
function renderSiteMeta() {
  const status = resolvePhStatusLabelV1(state.ph);
  if (els.siteLine) {
    els.siteLine.textContent = `現場: ${currentSite.siteName}`;
  }
  if (els.metaSiteName) {
    els.metaSiteName.textContent = currentSite.siteName;
  }
  if (els.metaPhStatus) {
    els.metaPhStatus.textContent = status.label;
  }
  if (els.metaCalib) {
    els.metaCalib.textContent = currentSite.calibrationDate;
  }
  if (els.metaHashPrefix) {
    els.metaHashPrefix.textContent = currentSite.hashIdPrefix;
  }
  if (els.maintNextCalib) {
    els.maintNextCalib.textContent =
      `次回校正日: ${currentSite.nextCalibrationDate}`;
  }
  if (els.siteSelect && els.siteSelect.value !== currentSite.id) {
    els.siteSelect.value = currentSite.id;
  }
}

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
  renderValve();
  renderSiteMeta();
  if (els.demoStatus) {
    els.demoStatus.textContent = state.statusMessage;
  }
  const busy = state.phase === "neutralizing";
  if (els.btnAlkaline) els.btnAlkaline.disabled = busy;
  if (els.btnNeutralize) els.btnNeutralize.disabled = busy;
  if (els.siteSelect) els.siteSelect.disabled = busy;
}

/**
 * 履歴カードを再描画
 * 既存 DOM 子は差し替え（データは配列維持）
 */
function renderHistoryList() {
  if (!els.historyList) return;
  const empty = els.historyEmpty;
  if (!historyList.length) {
    els.historyList.innerHTML = "";
    if (empty) {
      els.historyList.appendChild(empty);
      empty.hidden = false;
    } else {
      const p = document.createElement("p");
      p.className = "ew-history-empty";
      p.id = "ew-history-empty";
      p.textContent =
        "まだ履歴がありません。自動中和を実行するとここに記録されます。";
      els.historyList.appendChild(p);
      els.historyEmpty = p;
    }
    return;
  }
  if (empty) empty.hidden = true;
  const frag = document.createDocumentFragment();
  for (const row of historyList) {
    const item = document.createElement("article");
    item.className = "ew-history-item";
    item.setAttribute("role", "listitem");
    item.dataset.historyId = row.id;
    item.innerHTML = `
      <div class="ew-history-item-top">
        <p class="ew-history-time">${escapeHtml(row.timestamp)}</p>
        <span class="ew-history-status">${escapeHtml(row.status)}</span>
      </div>
      <p class="ew-history-ph">
        中和前 pH ${Number(row.phBefore).toFixed(1)}
        → 中和後 pH ${Number(row.phAfter).toFixed(1)}
      </p>
      <p class="ew-history-site">${escapeHtml(row.siteName)}</p>
      <div class="ew-history-actions">
        <button type="button" class="ew-btn ew-btn-navy ew-history-recert"
          data-history-id="${escapeAttr(row.id)}">
          証明書を再表示
        </button>
      </div>
    `;
    frag.appendChild(item);
  }
  els.historyList.innerHTML = "";
  els.historyList.appendChild(frag);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function persistBuffers() {
  saveSelectedSiteIdV1(storage, currentSite.id);
  saveNeutralizeHistoryV1(storage, historyList);
}

function clearNeutralizeTimer() {
  if (neutralizeTimer != null) {
    clearInterval(neutralizeTimer);
    neutralizeTimer = null;
  }
}

function onAlkaline() {
  clearNeutralizeTimer();
  lastLoggedCompleteKey = "";
  state = applyAlkalineSpikeV1(state);
  chart?.push(state.ph);
  renderState();
}

/**
 * 中和完了を履歴最上部へ追記
 * LocalStorage にもバッファ保存
 */
async function appendHistoryOnComplete() {
  const phBefore = Number(state.phBefore ?? 12.3);
  const phAfter = Number(state.phAfter ?? state.ph);
  const measuredAt = new Date().toLocaleString("ja-JP", {
    hour12: false,
  });
  const dedupeKey = `${currentSite.id}|${phBefore}|${phAfter}|${measuredAt}`;
  if (dedupeKey === lastLoggedCompleteKey) return;
  lastLoggedCompleteKey = dedupeKey;

  const payload = {
    companyName: currentSite.companyName || SITE.companyName,
    siteName: currentSite.siteName,
    measuredAt,
    phBefore: phBefore.toFixed(1),
    phAfter: phAfter.toFixed(1),
    calibrationDate: currentSite.calibrationDate,
  };
  const raw = buildCertificatePayloadV1(payload);
  const hash = await sha256HexV1(raw);
  const hashId = formatEcoWaterHashIdV1(
    hash,
    currentSite.hashIdPrefix
  );
  const entry = createNeutralizeHistoryEntryV1({
    siteId: currentSite.id,
    siteName: currentSite.siteName,
    companyName: payload.companyName,
    calibrationDate: payload.calibrationDate,
    phBefore,
    phAfter,
    hashId,
    timestamp: measuredAt,
    status: "放流適合",
  });
  historyList = prependNeutralizeHistoryV1(historyList, entry);
  persistBuffers();
  renderHistoryList();
}

function onNeutralize() {
  if (state.phase === "neutralizing") return;
  if (state.ph < 8.6 && state.phase === "idle") {
    state = applyAlkalineSpikeV1(state);
  }
  lastLoggedCompleteKey = "";
  state = startNeutralizeV1(state);
  chart?.push(state.ph);
  renderState();
  clearNeutralizeTimer();
  // 少し細かい刻みで pH 下降と
  // バルブ青点滅の連動を滑らかにする
  neutralizeTimer = window.setInterval(() => {
    const prevPhase = state.phase;
    state = stepNeutralizeV1(state, 0.16);
    chart?.push(state.ph);
    renderState();
    if (state.phase === "complete") {
      clearNeutralizeTimer();
      if (prevPhase !== "complete") {
        void appendHistoryOnComplete();
      }
    }
  }, 380);
}

function onReset() {
  clearNeutralizeTimer();
  if (valveCloseAnimTimer != null) {
    clearTimeout(valveCloseAnimTimer);
    valveCloseAnimTimer = null;
  }
  wasValveOpen = false;
  lastLoggedCompleteKey = "";
  state = createEcoWaterSimStateV1();
  state = {
    ...state,
    ph: currentSite.defaultPh,
    phAfter: currentSite.defaultPh,
    statusMessage:
      `待機中 — 放流適合（pH ${currentSite.defaultPh.toFixed(1)}）`,
  };
  chart?.push(state.ph);
  renderState();
}

/**
 * 現場切替：名前・pH状態・校正・Prefix を動的更新
 * デモ進行中はセレクト無効
 */
function onSiteChange(siteId) {
  clearNeutralizeTimer();
  if (valveCloseAnimTimer != null) {
    clearTimeout(valveCloseAnimTimer);
    valveCloseAnimTimer = null;
  }
  wasValveOpen = false;
  lastLoggedCompleteKey = "";
  currentSite = findEcoWaterSiteV1(siteId);
  persistBuffers();
  state = createEcoWaterSimStateV1();
  state = {
    ...state,
    ph: currentSite.defaultPh,
    phAfter: currentSite.defaultPh,
    statusMessage:
      `待機中 — 放流適合（pH ${currentSite.defaultPh.toFixed(1)}）`,
  };
  chart?.push(state.ph);
  renderState();
}

/**
 * 証明書モーダルを開く
 * 履歴再表示時は entry を渡す
 * @param {object | null} [fromHistory]
 */
async function openCertificate(fromHistory = null) {
  const measuredAt =
    fromHistory?.timestamp ||
    new Date().toLocaleString("ja-JP", { hour12: false });
  const phBefore = fromHistory
    ? Number(fromHistory.phBefore)
    : state.phBefore ??
      (state.ph > ECO_WATER_DEFAULT_PH + 0.2 ? state.ph : 12.3);
  const phAfter = fromHistory
    ? Number(fromHistory.phAfter)
    : state.phAfter ?? state.ph;
  const siteName = fromHistory?.siteName || currentSite.siteName;
  const companyName =
    fromHistory?.companyName ||
    currentSite.companyName ||
    SITE.companyName;
  const calibrationDate =
    fromHistory?.calibrationDate || currentSite.calibrationDate;
  const payload = {
    companyName,
    siteName,
    measuredAt,
    phBefore: Number(phBefore).toFixed(1),
    phAfter: Number(phAfter).toFixed(1),
    calibrationDate,
  };
  let hashId = fromHistory?.hashId || "";
  if (!hashId) {
    const raw = buildCertificatePayloadV1(payload);
    const hash = await sha256HexV1(raw);
    const prefix =
      fromHistory?.siteId
        ? findEcoWaterSiteV1(fromHistory.siteId).hashIdPrefix
        : currentSite.hashIdPrefix;
    hashId = formatEcoWaterHashIdV1(hash, prefix);
  }

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
  els.siteSelect?.addEventListener("change", (ev) => {
    const target = /** @type {HTMLSelectElement} */ (ev.target);
    onSiteChange(target.value);
  });
  els.historyList?.addEventListener("click", (ev) => {
    const btn = /** @type {HTMLElement | null} */ (
      ev.target instanceof Element
        ? ev.target.closest(".ew-history-recert")
        : null
    );
    if (!btn) return;
    const id = btn.getAttribute("data-history-id");
    const row = historyList.find((h) => h.id === id);
    if (row) void openCertificate(row);
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

/**
 * セレクト option をカタログから同期
 * HTML 既定 option は維持しつつ差分追記
 */
function syncSiteSelectOptions() {
  if (!els.siteSelect) return;
  const sites = listEcoWaterSitesV1();
  const existing = new Set(
    [...els.siteSelect.options].map((o) => o.value)
  );
  for (const site of sites) {
    if (existing.has(site.id)) continue;
    const opt = document.createElement("option");
    opt.value = site.id;
    opt.textContent = site.siteName;
    els.siteSelect.appendChild(opt);
  }
}

/**
 * LocalStorage から現場・履歴を復元
 * 既存バッファがあれば上書きせず採用
 */
function restoreBuffers() {
  const savedId = loadSelectedSiteIdV1(
    storage,
    ECO_WATER_DEFAULT_SITE_ID_V1
  );
  currentSite = findEcoWaterSiteV1(savedId);
  historyList = loadNeutralizeHistoryV1(storage);
  state = createEcoWaterSimStateV1();
  state = {
    ...state,
    ph: currentSite.defaultPh,
    phAfter: currentSite.defaultPh,
    statusMessage:
      `待機中 — 放流適合（pH ${currentSite.defaultPh.toFixed(1)}）`,
  };
}

function boot() {
  configureBackLink();
  syncSiteSelectOptions();
  restoreBuffers();
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
  renderHistoryList();
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
  if (valveCloseAnimTimer != null) clearTimeout(valveCloseAnimTimer);
  persistBuffers();
  chart?.destroy();
});

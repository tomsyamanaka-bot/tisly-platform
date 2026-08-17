/**
 * TiSLY HOME — お客様・住まい用入口 v1
 *
 * 社内向けの回路 ON/OFF は出さず、
 * 生活で使う操作だけを大きく置く。
 */

import {
  byId,
  escapeHtml,
  fetchHomeCustomer,
  hideRingPopup,
  readSiteIdFromUrl,
  renderAircons,
  renderBath,
  renderCt,
  renderIntercom,
  renderLock,
  renderNotes,
  renderStatusHero,
  replaceSiteIdInUrl,
  sendHomeControl,
  setText,
  showToast,
  updateRingPopup,
} from "./home-shared-v1.js";
import {
  bindHomeTileDetailsV1,
  renderHomeTilesV1,
} from "./home-tiles-v1.js";

const POLL_INTERVAL_MS = 20000;

let currentSiteId = "";
let controlBusy = false;

async function loadSiteOptions() {
  const select = byId("hm-site-select");
  if (!select) return;
  try {
    const res = await fetch("/api/home/v1/sites", {
      cache: "no-store",
    });
    const data = await res.json();
    const sites = data.ok && Array.isArray(data.sites) ? data.sites : [];
    if (!sites.length) {
      select.innerHTML = '<option value="">おうちがありません</option>';
      return;
    }
    select.innerHTML = sites
      .map(
        (s) => `
        <option value="${escapeHtml(s.id)}">
          ${escapeHtml(s.displayName)}
        </option>`
      )
      .join("");
    if (!currentSiteId) currentSiteId = sites[0].id;
    select.value = currentSiteId;
  } catch {
    select.innerHTML = '<option value="">読み込めませんでした</option>';
  }
}

function renderAll(dashboard) {
  currentSiteId = dashboard.siteId;
  renderStatusHero(dashboard);
  // 2列グリッドのタイル（やさしい言い方）
  renderHomeTilesV1(dashboard, { plain: true });
  // お客様向けは回路の遠隔ON/OFFを出さない
  renderCt(dashboard, { withControls: false });
  renderBath(dashboard);
  renderAircons(dashboard, { withControls: true });
  renderLock(dashboard);
  renderIntercom(dashboard);
  renderNotes(dashboard);
  updateRingPopup(dashboard);
  // お客様向けの言い換え
  setText(
    "hm-ct-warn",
    `気をつける目安 ${dashboard.ct.warnThresholdA} A`
  );
  setText(
    "hm-ct-alert",
    `止まる目安 ${dashboard.ct.alertThresholdA} A`
  );
  setText(
    "hm-ct-load",
    Math.max(0, 100 - Math.round(dashboard.ct.loadPercent))
  );
  setText(
    "hm-ct-peak",
    dashboard.ct.peakCutActive ? "はたらき中" : "おやすみ"
  );
  setText(
    "hm-bath-current",
    `いまの湯温 ${Number(dashboard.bath.currentTempC).toFixed(1)} ℃`
  );
  setText("hm-bath-percent", `たまり具合 ${dashboard.bath.fillPercent}%`);
  setText("hm-bath-note", dashboard.bath.fillStateLabel);
  setText(
    "hm-ct-note",
    `${dashboard.ct.levelLabel} · 契約 ${dashboard.ct.contractDemandKw} kW`
  );
}

async function handleControl(el) {
  const target = el.dataset.target;
  const action = el.dataset.action;
  if (!target || !action) return;

  const deviceKey = el.dataset.device || null;
  let value = el.dataset.value;
  if (el.tagName === "INPUT" && el.type === "range") {
    value = el.value;
  }
  if (value === "true") value = true;
  else if (value === "false") value = false;

  el.disabled = true;
  controlBusy = true;
  try {
    const res = await sendHomeControl({
      siteId: currentSiteId,
      target,
      action,
      deviceKey,
      value,
      actor: "住まいのアプリ",
    });
    showToast(res.message || "操作しました");
    if (target === "intercom") hideRingPopup();
    renderAll(res.dashboard);
  } catch (err) {
    console.error(err);
    showToast(err.message || "操作できませんでした");
  } finally {
    el.disabled = false;
    controlBusy = false;
  }
}

function bindControlDelegation() {
  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-target][data-action]");
    if (!el || el.tagName === "INPUT") return;
    handleControl(el);
  });
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (
      el.tagName === "INPUT" &&
      el.dataset.target &&
      el.dataset.action
    ) {
      handleControl(el);
    }
  });
}

async function refresh() {
  const dashboard = await fetchHomeCustomer(currentSiteId);
  renderAll(dashboard);
}

document.addEventListener("DOMContentLoaded", async () => {
  currentSiteId = readSiteIdFromUrl();
  bindControlDelegation();
  bindHomeTileDetailsV1();
  await loadSiteOptions();

  const select = byId("hm-site-select");
  if (select) {
    select.addEventListener("change", async () => {
      currentSiteId = select.value;
      replaceSiteIdInUrl(currentSiteId);
      try {
        await refresh();
      } catch (err) {
        console.error(err);
        showToast("読み込めませんでした");
      }
    });
  }

  refresh().catch((err) => {
    console.error(err);
    setText("hm-status-label", "読み込めませんでした");
  });

  setInterval(() => {
    if (controlBusy || document.hidden) return;
    refresh().catch(() => {
      /* 一時的な通信断は無視 */
    });
  }, POLL_INTERVAL_MS);
});

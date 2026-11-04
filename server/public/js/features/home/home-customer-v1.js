/**

 * TiSLY HOME — お客様・住まい用入口 v1

 *

 * 社内向けの回路 ON/OFF は出さず、

 * 生活で使う操作だけを大きく置く。

 */



import {

  byId,

  fetchHomeCustomer,

  fetchHomeCustomerSites,

  hideRingPopup,

  renderAircons,

  renderBath,

  renderCt,

  renderIntercom,

  renderLock,

  replaceSiteIdInUrl,

  sendHomeControl,

  setText,

  showToast,

  updateRingPopup,

  refreshHomeExtrasV1,

  bindBathScheduleUiV1,

  bindHomeSecurityUiV1,

  bindSystemLogModalV1,

  refreshHomeSecurityPanelsV1,

} from "./home-shared-v1.js";

import {

  bindHomeTileDetailsV1,

  renderHomeTilesV1,

  applyOptimisticHomeControlV1,

} from "./home-tiles-v1.js";

import {
  requireCustomerSession,
  loadTenantProfile,
} from "../../customer-tenant-session-v1.js";
import {
  isLivePropertyIdV1,
  viewerMayUseLiveHardwareV1,
} from "../../customer-auth.js";

const customerSessionOk = requireCustomerSession();

const POLL_INTERVAL_MS = 30000;

const PLAIN_OPTS = { plain: true };



let currentSiteId = "";

let controlBusy = false;

/** 直近のダッシュボード（楽観的 UI 用） */

let dashCache = null;



function paintHomeSiteLabel(name, loading) {
  const skeleton = document.getElementById("hm-site-skeleton");
  const fixed = document.getElementById("hm-site-fixed-label");
  const card = document.getElementById("hm-site-card");
  if (card) card.setAttribute("aria-busy", loading ? "true" : "false");
  if (skeleton) {
    skeleton.hidden = !loading;
    if (loading && name) skeleton.textContent = name;
  }
  if (fixed) {
    fixed.hidden = loading;
    if (!loading) fixed.textContent = name || "ご契約のおうち";
  }
}

async function loadSiteOptions() {
  document.getElementById("hm-site-select")?.remove();
  paintHomeSiteLabel("おうちを確認しています", true);
  try {
    let tenantHomeId = "";
    let tenantName = "";
    const { isLoggedIn, refreshTenantProfile } = await import(
      "../../customer-tenant-session-v1.js"
    );
    if (isLoggedIn()) {
      await refreshTenantProfile();
      const profile = loadTenantProfile();
      tenantHomeId = profile?.homeSiteId || "";
      tenantName = profile?.displayName || "";
      if (
        tenantHomeId &&
        isLivePropertyIdV1(tenantHomeId) &&
        !viewerMayUseLiveHardwareV1()
      ) {
        tenantHomeId = "";
        tenantName = "";
      }
    }
    if (!tenantHomeId) {
      paintHomeSiteLabel("おうちがありません", true);
      return;
    }
    const sites = await fetchHomeCustomerSites();
    const mine = (sites || []).filter((row) => row.id === tenantHomeId);
    const row = mine[0] || {
      id: tenantHomeId,
      displayName: tenantName || "ご契約のおうち",
    };
    currentSiteId = row.id;
    window.__TISLY_HM_SITE_ID = row.id;
    replaceSiteIdInUrl(currentSiteId);
    paintHomeSiteLabel(row.displayName || tenantName, false);
    const linkNote = document.getElementById("hm-intercom-link-note");
    if (linkNote) {
      linkNote.textContent = row.displayName || tenantName || "ご契約のおうち";
    }
    try {
      const { setPropertyScope } = await import(
        "../../shared/property-scope-v1.js"
      );
      setPropertyScope({
        siteId: currentSiteId,
        propertyId: currentSiteId,
        displayName: row.displayName || tenantName,
        locked: true,
        source: "home-customer",
        persist: false,
      });
    } catch {
      /* スコープ保存に失敗しても表示は残す */
    }
  } catch {
    paintHomeSiteLabel("読み込めませんでした", true);
  }
}



function renderAll(dashboard) {

  currentSiteId = dashboard.siteId;

  dashCache = dashboard;

  renderStatusHeroPlain(dashboard);

  renderHomeTilesV1(dashboard, PLAIN_OPTS);

  renderCt(dashboard, { withControls: false, ...PLAIN_OPTS });

  renderBath(dashboard, PLAIN_OPTS);

  renderAircons(dashboard, { withControls: true, ...PLAIN_OPTS });

  renderLock(dashboard, PLAIN_OPTS);

  renderIntercom(dashboard, { withUnlock: true });

  updateRingPopup(dashboard);

  refreshHomeExtrasV1(currentSiteId, dashboard, { plain: true }).catch(

    () => {

      /* ログ取得失敗は無視 */

    }

  );

  refreshHomeSecurityPanelsV1(currentSiteId).catch(() => {

    /* 防犯パネル取得失敗は無視 */

  });

}



function renderStatusHeroPlain(d) {

  const hero = byId("hm-status-hero");

  if (hero) {

    hero.classList.remove(

      "is-normal",

      "is-peak_warning",

      "is-security_alert"

    );

    hero.classList.add(`is-${d.status}`);

  }

  setText("hm-status-emoji", d.statusEmoji);

  setText("hm-status-label", d.statusLabel);

  setText("hm-status-meta", d.displayName);

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



  const isBathPulse =

    target === "bath" &&

    action === "auto_fill" &&

    (el.classList.contains("is-oneshot") ||

      el.textContent?.includes("お湯はり"));

  const pulseStatus = byId("hm-bath-pulse-status");



  el.disabled = true;

  controlBusy = true;

  if (dashCache) {

    const optimistic = applyOptimisticHomeControlV1(dashCache, {

      target,

      action,

      deviceKey,

      value,

    });

    renderHomeTilesV1(optimistic, PLAIN_OPTS);

  }

  if (isBathPulse && pulseStatus) {

    pulseStatus.hidden = false;

    pulseStatus.classList.add("is-sending");

    pulseStatus.classList.remove("is-done");

    pulseStatus.textContent = "実機へ送信中...";

  }

  try {

    const res = await sendHomeControl({

      siteId: currentSiteId,

      target,

      action,

      deviceKey,

      value,

      actor: "住まいのアプリ",

      audience: "customer",

      bypassSchedule: target === "security_light",

    });

    if (isBathPulse && pulseStatus) {

      pulseStatus.classList.remove("is-sending");

      pulseStatus.classList.add("is-done");

      pulseStatus.textContent = res.message || "湯はり指令送信完了";

    }

    showToast(res.message || "操作しました");

    if (target === "intercom") hideRingPopup();

    renderAll(res.dashboard);

  } catch (err) {

    console.error(err);

    if (isBathPulse && pulseStatus) {

      pulseStatus.classList.remove("is-sending");

      pulseStatus.textContent = "送信に失敗しました";

    }

    showToast(err.message || "操作できませんでした");

    try {

      const d = await fetchHomeCustomer(currentSiteId);

      renderAll(d);

    } catch {

      /* ignore */

    }

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

  if (!customerSessionOk) return;

  document.getElementById("hm-site-select")?.remove();
  const earlyHome = loadTenantProfile();
  currentSiteId = earlyHome?.homeSiteId || "";
  if (currentSiteId) window.__TISLY_HM_SITE_ID = currentSiteId;

  bindControlDelegation();

  bindHomeTileDetailsV1();

  bindBathScheduleUiV1(

    () => currentSiteId,

    () => "お客様"

  );

  bindHomeSecurityUiV1(

    () => currentSiteId,

    () => "お客様",

    (result) => {

      if (result?.dashboard) renderAll(result.dashboard);

      else refresh().catch(() => {});

    }

  );

  bindSystemLogModalV1();

  await loadSiteOptions();

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


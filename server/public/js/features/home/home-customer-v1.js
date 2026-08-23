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

  fetchHomeCustomerSites,

  hideRingPopup,

  readSiteIdFromUrl,

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

} from "./home-tiles-v1.js";



const POLL_INTERVAL_MS = 20000;

const PLAIN_OPTS = { plain: true };



let currentSiteId = "";

let controlBusy = false;



async function loadSiteOptions() {

  const select = byId("hm-site-select");

  if (!select) return;

  try {

    const sites = await fetchHomeCustomerSites();

    if (!sites.length) {

      select.innerHTML = '<option value="">おうちがありません</option>';

      return;

    }

    select.innerHTML = sites

      .map(

        (s) => `

        <option value="${escapeHtml(s.id)}">

          ${escapeHtml(s.statusEmoji)} ${escapeHtml(s.displayName)}

          — ${escapeHtml(s.statusLabel)}

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


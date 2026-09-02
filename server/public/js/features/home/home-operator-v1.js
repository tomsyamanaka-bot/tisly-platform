/**
 * TiSLY HOME — 社内・統合入口 v1
 *
 * 4大デバイスの状態表示とワンタップ制御。
 * 制御成功時はサーバー返却の dashboard で
 * 画面を差分更新する。
 */

import {
  byId,
  escapeHtml,
  fetchHomeOperator,
  hideRingPopup,
  readSiteIdFromUrl,
  renderAircons,
  renderBath,
  renderCt,
  renderIntercom,
  renderLock,
  renderNotes,
  renderStatusHero,
  renderSwitchBotBadge,
  renderSystemLogs,
  refreshHomeExtrasV1,
  bindBathScheduleUiV1,
  bindSystemLogModalV1,
  replaceSiteIdInUrl,
  sendHomeControl,
  setText,
  showToast,
  updateRingPopup,
} from "./home-shared-v1.js";
import {
  bindHomeTileDetailsV1,
  renderHomeTilesV1,
  applyOptimisticHomeControlV1,
} from "./home-tiles-v1.js";
import { setPropertyScope } from "../../shared/property-scope-v1.js";

const POLL_INTERVAL_MS = 30000;

let currentSiteId = "";
let selectedPropertyId = "";
let siteOptionsKey = "";
/** 操作中は自動更新で画面を奪わない */
let controlBusy = false;
/** 社内向けフルダッシュボード（operator API から保持） */
let operatorCache = null;

function publishHomeOperatorScope(displayName) {
  selectedPropertyId = currentSiteId;
  setPropertyScope({
    siteId: currentSiteId,
    propertyId: currentSiteId,
    displayName: displayName || currentSiteId,
    locked: false,
    source: "home-operator",
    persist: true,
  });
}

function pickSiteDashboard(operator) {
  if (!operator?.sites?.length) return null;
  const found = operator.sites.find((s) => s.siteId === currentSiteId);
  return found ?? operator.sites[0];
}

function renderSiteOptions(operator) {
  const select = byId("hm-site-select");
  if (!select) return;
  const key = operator.sites.map((s) => s.siteId).join("|");
  if (key === siteOptionsKey) {
    select.value = currentSiteId;
    return;
  }
  siteOptionsKey = key;
  select.innerHTML = operator.sites
    .map((s) => {
      const live = s.operationMode === "live" ? " · 実機" : "";
      const name =
        s.operationMode === "live"
          ? `🟢 ${s.displayName}`
          : `${s.statusEmoji} ${s.displayName}`;
      return `
      <option value="${escapeHtml(s.siteId)}">
        ${escapeHtml(name)}${escapeHtml(live)}
      </option>`;
    })
    .join("");
  select.value = currentSiteId;
  select.disabled = operator.sites.length <= 1;
}

function renderSummary(operator) {
  setText("hm-sum-total", operator.totalSites);
  setText("hm-sum-overload", operator.overloadCount);
  setText("hm-sum-security", operator.securityAlertCount);
  setText("hm-sum-aircon", operator.airconRunningCount);
}

function renderSiteList(operator) {
  const root = byId("hm-site-list");
  if (!root) return;
  if (!operator.sites.length) {
    root.innerHTML = '<p class="hm-empty">登録物件がありません</p>';
    return;
  }
  root.innerHTML = operator.sites
    .map((s) => {
      let cls = "hm-site-card";
      let badge = '<span class="hm-badge hm-badge-ok">正常</span>';
      if (s.status === "security_alert") {
        cls += " is-security";
        badge =
          '<span class="hm-badge hm-badge-danger">玄関要確認</span>';
      } else if (s.status === "peak_warning") {
        cls += " is-peak";
        badge =
          '<span class="hm-badge hm-badge-warn">過負荷警告</span>';
      }
      return `
        <article class="${cls}">
          <div class="hm-site-head">
            <div>
              <h3 class="hm-site-name">${escapeHtml(
                s.displayName
              )}</h3>
              <p class="hm-site-addr">
                ${escapeHtml(s.addressLabel)} ·
                ${escapeHtml(s.countryCode)}/${escapeHtml(s.currency)} ·
                ${escapeHtml(s.voltageSpec)}
              </p>
            </div>
            ${badge}
          </div>
          <p class="hm-site-metrics">
            主幹 ${Number(s.ct.mainCurrentA).toFixed(1)} A ·
            ${Number(s.ct.powerKw).toFixed(1)} kW ·
            湯はり ${escapeHtml(s.bath.fillStateLabel)} ·
            空調 ${s.activeAirconCount}台 ·
            玄関 ${escapeHtml(s.lock.lockEmoji)}
            ${escapeHtml(s.lock.lockLabel)}
          </p>
          <p class="hm-site-addr">
            プラン ${escapeHtml(s.planCode)} ·
            ${escapeHtml(s.planStatus)} ·
            月額 ${s.monthlyFee} ${escapeHtml(s.currency)}
          </p>
          <a
            class="hm-site-open"
            href="/home-v1?siteId=${encodeURIComponent(s.siteId)}"
          >この住まいを開く</a>
        </article>`;
    })
    .join("");
}

function renderSiteDetail(dashboard) {
  renderStatusHero(dashboard);
  // 2列グリッドのタイル（機器の入口）
  renderHomeTilesV1(dashboard);
  renderCt(dashboard, { withControls: true });
  renderBath(dashboard);
  renderAircons(dashboard, { withControls: true });
  renderLock(dashboard);
  renderIntercom(dashboard);
  renderNotes(dashboard);
  updateRingPopup(dashboard);
  refreshHomeExtrasV1(currentSiteId, dashboard).catch(() => {
    /* ログ取得失敗は無視 */
  });
}

/** 制御ボタン・スライダーの共通ハンドラ */
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

  // 回路の relay は circuit ターゲットの ON/OFF
  const apiAction = target === "circuit" ? "relay" : action;
  const isBathPulse =
    target === "bath" &&
    action === "auto_fill" &&
    (el.classList.contains("is-oneshot") ||
      el.textContent?.includes("お湯はり"));

  el.disabled = true;
  controlBusy = true;

  // 楽観的 UI: タップ直後にタイル表示を切り替え
  const currentDash = pickSiteDashboard(operatorCache);
  if (currentDash) {
    const optimistic = applyOptimisticHomeControlV1(currentDash, {
      target,
      action: apiAction,
      deviceKey,
      value,
    });
    renderHomeTilesV1(optimistic);
  }

  const pulseStatus = byId("hm-bath-pulse-status");
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
      action: apiAction,
      deviceKey,
      value,
      actor: "社内オペレーター",
    });
    if (isBathPulse && pulseStatus) {
      pulseStatus.classList.remove("is-sending");
      pulseStatus.classList.add("is-done");
      pulseStatus.textContent =
        res.message || "湯はり指令送信完了";
    }
    showToast(res.message || "操作しました");
    if (target === "intercom") hideRingPopup();
    renderSiteDetail(res.dashboard);
    const operator = await fetchHomeOperator();
    operatorCache = operator;
    renderSummary(operator);
    renderSiteList(operator);
    renderSiteOptions(operator);
  } catch (err) {
    console.error(err);
    if (isBathPulse && pulseStatus) {
      pulseStatus.classList.remove("is-sending");
      pulseStatus.textContent = "送信に失敗しました";
    }
    showToast(err.message || "操作に失敗しました");
    // 失敗時はサーバー状態へ戻す
    try {
      await refresh();
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
  const operator = await fetchHomeOperator();
  operatorCache = operator;
  if (!currentSiteId && operator.sites.length) {
    currentSiteId = operator.sites[0].siteId;
  }
  renderSummary(operator);
  renderSiteList(operator);
  renderSiteOptions(operator);
  const dashboard = pickSiteDashboard(operator);
  if (dashboard) {
    currentSiteId = dashboard.siteId;
    selectedPropertyId = dashboard.siteId;
    publishHomeOperatorScope(dashboard.displayName);
    renderSiteDetail(dashboard);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  currentSiteId = readSiteIdFromUrl();
  bindControlDelegation();
  bindHomeTileDetailsV1();
  bindBathScheduleUiV1(
    () => currentSiteId,
    () => "社内オペレーター"
  );
  bindSystemLogModalV1();
  renderSwitchBotBadge();

  const select = byId("hm-site-select");
  if (select) {
    select.addEventListener("change", async () => {
      currentSiteId = select.value;
      selectedPropertyId = currentSiteId;
      replaceSiteIdInUrl(currentSiteId);
      try {
        const dashboard = pickSiteDashboard(operatorCache);
        if (dashboard && dashboard.siteId === currentSiteId) {
          publishHomeOperatorScope(dashboard.displayName);
          renderSiteDetail(dashboard);
        } else {
          await refresh();
        }
      } catch (err) {
        console.error(err);
        showToast("読み込みに失敗しました");
      }
    });
  }

  refresh().catch((err) => {
    console.error(err);
    showToast("読み込みに失敗しました");
    setText("hm-status-label", "読み込みに失敗しました");
  });

  // 実機テレメトリ想定の定期更新
  setInterval(() => {
    if (controlBusy || document.hidden) return;
    refresh().catch(() => {
      /* 一時的な通信断は無視 */
    });
  }, POLL_INTERVAL_MS);
});

/**
 * 社内向けダークSOC
 * 3D俯瞰 · 発報連動 · ログ
 * API 成否に関わらず即時描画する
 */

import {
  formatAlarmTime,
  renderGuardModes,
  renderIsoStack,
  renderSocLayerButtons,
  socFloorLabel,
  visibleFloors,
} from "./security-floor-map-v1.js";
import {
  applySecurityOrbit,
  bindSecurityOrbit,
  setSecurityDrumFloor,
} from "./security-floor-orbit-v1.js";
import {
  FALLBACK_DEFAULT_SITE_ID,
  applyLocalAck,
  applyLocalGuardMode,
  applyLocalLights,
  applyLocalPrimaryAlert,
  getFallbackOperatorBundle,
  listFallbackSites,
  markSecurityUiReady,
} from "./security-floor-fallback-v1.js";
import { updateSecurityIso3d } from "./security-floor-iso3d-v1.js";
import { refreshSecurityRemoteConfigV1 } from "./security-floor-remote-config-v1.js";

const state = {
  siteId: FALLBACK_DEFAULT_SITE_ID,
  floorId: "1f",
  site: null,
  dash: null,
  showSensors: true,
  showZones: true,
  showLabels: true,
  logKind: "",
  logFloor: "",
  logQ: "",
  logDate: "",
  pane: "map",
  pollTimer: null,
  alarmSig: "",
};

function $(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function setHtml(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

async function fetchJson(url, opts) {
  const res = await fetch(url, {
    cache: "no-store",
    ...opts,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("応答を解析できません");
  }
  if (!data?.ok) {
    throw new Error(data?.error || "読込失敗");
  }
  return data;
}

function tickClock() {
  const el = $("sf-clock");
  if (!el) return;
  el.textContent = new Date().toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function siteOptionLabel(s) {
  const id = s.siteId || s.id;
  if (id === "SEC-JP-ITABASHI-LIVE") {
    return "板橋自宅 (HOME-JP-ITABASHI-LIVE)";
  }
  return `${s.displayName}（${s.countryCode || "JP"}）`;
}

/** UI 表示対象のみ（板橋自宅） */
function filterUiSites(sites) {
  const allow = new Set(["SEC-JP-ITABASHI-LIVE"]);
  return (sites || []).filter((s) =>
    allow.has(s.siteId || s.id)
  );
}

function sortSitesForSelect(sites) {
  const list = [...(sites || [])];
  list.sort((a, b) => {
    const aid = a.siteId || a.id;
    const bid = b.siteId || b.id;
    if (aid === "SEC-JP-ITABASHI-LIVE") return -1;
    if (bid === "SEC-JP-ITABASHI-LIVE") return 1;
    return 0;
  });
  return list;
}

function fillSiteSelect(sites) {
  const sel = $("sf-site-select");
  if (!sel) return;
  const list = sortSitesForSelect(
    filterUiSites(
      sites?.length ? sites : listFallbackSites()
    )
  );
  // 万一空なら板橋を強制投入
  if (!list.length) {
    list.push({
      id: "SEC-JP-ITABASHI-LIVE",
      siteId: "SEC-JP-ITABASHI-LIVE",
      displayName: "板橋自宅",
      countryCode: "JP",
    });
  }
  sel.innerHTML = list
    .map((s) => {
      const id = s.siteId || s.id;
      return `<option value="${id}">${siteOptionLabel(s)}</option>`;
    })
    .join("");
  state.siteId = "SEC-JP-ITABASHI-LIVE";
  sel.value = state.siteId;
  // 単一物件のため切替不可表示
  sel.disabled = list.length <= 1;
}

function syncHeaderTitle(site) {
  const title =
    site?.id === "SEC-JP-ITABASHI-LIVE" ||
    site?.siteId === "SEC-JP-ITABASHI-LIVE"
      ? "板橋自宅 (HOME-JP-ITABASHI-LIVE)"
      : site?.displayName ||
        "板橋自宅 (HOME-JP-ITABASHI-LIVE)";
  setText("sf-title", title);
  if (document.title) {
    document.title = `TiSLY · ${title}`;
  }
  setText("sf-remote-target", `実機: HOME-JP-ITABASHI-LIVE`);
}

function openAlarms(soc) {
  return (soc?.alarmLogs || []).filter((l) => l.status !== "done");
}

function alarmSignature(site) {
  const open = openAlarms(site?.soc);
  return [
    site?.hasAlert ? "1" : "0",
    String(open.length),
    open
      .map((a) => `${a.id}:${a.at}:${a.status}:${a.kindLabel}`)
      .join("|"),
  ].join("::");
}

function applyStatusHero(site) {
  const alerting = !!site?.hasAlert || openAlarms(site?.soc).length > 0;
  $("sf-status-hero")?.classList.toggle("is-alert", alerting);
  setText("sf-status-emoji", alerting ? "🚨" : "🟢");
  setText("sf-status-label", alerting ? "発報中" : "正常です");
}

function formatHeartbeatAt(iso) {
  if (!iso) return "未受信";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "未受信";
  return new Date(t).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function renderKpi(site, _dash) {
  const soc = site.soc || {};
  const online = !!soc.deviceOnline;
  const ms =
    typeof soc.networkMs === "number" && Number.isFinite(soc.networkMs)
      ? Math.max(0, Math.round(soc.networkMs))
      : null;
  const html = [
    [
      "ネットワーク遅延",
      ms != null ? `${ms} ms` : "—",
      "API 往復の実測",
      online ? "ok" : "alert",
    ],
    [
      "稼働ステータス",
      online ? "オンライン" : "オフライン",
      online ? "実機接続中" : "ハートビート待機",
      online ? "ok" : "alert",
    ],
    [
      "最新ハートビート",
      formatHeartbeatAt(soc.lastHeartbeatAt),
      "RP2350",
      online ? "ok" : "info",
    ],
  ]
    .map(
      (row) => `<article class="sf-kpi ${row[3]}">
        <p>${row[0]}</p><strong>${row[1]}</strong><span>${row[2]}</span>
      </article>`
    )
    .join("");
  setHtml("sf-kpi", html);
  setText("sf-online", online ? "● オンライン" : "● オフライン");
}

function renderAlarms(site) {
  const soc = site.soc || {};
  const open = openAlarms(soc);
  $("sf-alarm-panel")?.classList.toggle(
    "is-live",
    open.length > 0
  );
  setText("sf-alarm-count", `${open.length}件発生中`);
  setText("sf-bell-count", String(open.length));
  setHtml(
    "sf-alarm-list",
    open
      .slice(0, 8)
      .map(
        (a) => `<li data-sensor="${a.sensorId || ""}">
          <b>🔴 【発報中】${a.kindLabel || a.deviceLabel || "センサー検知"}</b>
          <span>（${formatAlarmTime(a.at)}）</span>
        </li>`
      )
      .join("") || "<li>発報はありません</li>"
  );
  const top = open[0];
  setHtml(
    "sf-alarm-detail",
    top
      ? `<div><dt>時刻</dt><dd>${formatAlarmTime(top.at)}</dd></div>
         <div><dt>デバイス</dt><dd>${top.deviceLabel}</dd></div>
         <div><dt>種別</dt><dd>${top.kindLabel}</dd></div>
         <div><dt>ステータス</dt><dd><em class="st-open">未対応</em></dd></div>
         <div><dt>場所</dt><dd>${top.location}</dd></div>
         <div><dt>フロア</dt><dd>${socFloorLabel(top.floorId)}</dd></div>`
      : "<p>選択中の警報はありません</p>"
  );
  applyStatusHero(site);
}

function logIconFor(entry) {
  const kind = String(entry.kindLabel || entry.kind || "");
  const loc = `${entry.location || ""}${entry.deviceLabel || ""}${kind}`;
  if (/湯|風呂|浴槽|bath/i.test(loc)) return "♨️";
  if (/ライト|照明|light|点灯/i.test(loc)) return "💡";
  if (/警戒|警備|guard|モード/i.test(loc)) return "🛡️";
  if (/侵入|開放|人感|ガス|警報|アラーム/i.test(loc)) return "🚨";
  if (entry.status === "open" || entry.status === "handling") return "🚨";
  return "🛡️";
}

function logCategoryBucket(entry) {
  const kind = String(entry.kindLabel || "");
  if (/侵入|開放|人感|ガス|警報/.test(kind)) return "security";
  if (/湯|風呂|空調|鍵|ライト|照明/.test(kind + (entry.location || ""))) {
    return "home";
  }
  return "system";
}

function filterAlarmLogs(logs) {
  const kind = state.logKind;
  const floor = state.logFloor;
  const q = state.logQ.trim();
  const date = state.logDate;
  return logs.filter((l) => {
    if (floor && l.floorId !== floor) return false;
    if (q && !`${l.location}${l.deviceLabel}${l.kindLabel}`.includes(q)) {
      return false;
    }
    if (date) {
      const day = String(l.at || "").slice(0, 10);
      if (day !== date) return false;
    }
    if (!kind) return true;
    if (kind === "security" || kind === "home" || kind === "system") {
      return logCategoryBucket(l) === kind;
    }
    return l.kindLabel === kind;
  });
}

function renderLogs(site) {
  const logs = [...(site.soc?.alarmLogs || [])];
  const compact = $("sf-log-compact");
  const body = $("sf-log-body");
  const recent = logs.slice(0, 10);

  if (compact) {
    if (!recent.length) {
      compact.innerHTML =
        '<p class="sf-log-empty">動作ログはまだありません</p>';
    } else {
      compact.innerHTML = recent
        .map((l) => {
          const alert =
            l.status === "open" || /侵入|警報|センサー検知/.test(l.kindLabel || "");
          return `<article class="sf-log-row${alert ? " is-alert" : ""}">
            <span class="sf-log-ico" aria-hidden="true">${logIconFor(l)}</span>
            <div class="sf-log-main">
              <p class="sf-log-title">${l.kindLabel} · ${l.location}</p>
              <p class="sf-log-sub">${socFloorLabel(l.floorId)} · ${l.deviceLabel}</p>
            </div>
            <time class="sf-log-time">${formatAlarmTime(l.at)}</time>
          </article>`;
        })
        .join("");
    }
  }

  if (body) {
    const rows = filterAlarmLogs(logs);
    const stClass = {
      open: "st-open",
      handling: "st-busy",
      done: "st-done",
    };
    const stLabel = {
      open: "未対応",
      handling: "対応中",
      done: "対応済み",
    };
    body.innerHTML = rows
      .map(
        (l) => `<tr>
        <td>${formatAlarmTime(l.at)}</td>
        <td>${socFloorLabel(l.floorId)}</td>
        <td>${l.location}</td>
        <td>${l.kindLabel}</td>
        <td>${l.deviceLabel}</td>
        <td><em class="${stClass[l.status] || "st-open"}">${stLabel[l.status] || l.status}</em></td>
        <td>${l.handler || "—"}</td>
      </tr>`
      )
      .join("");
  }

  const fl = $("sf-log-floor");
  if (fl) {
    const current = fl.value;
    fl.innerHTML = '<option value="">フロアすべて</option>';
    visibleFloors(site.floors, site).forEach((f) => {
      const op = document.createElement("option");
      op.value = f.id;
      op.textContent = socFloorLabel(f.id, f.label);
      fl.appendChild(op);
    });
    if ([...fl.options].some((o) => o.value === current)) {
      fl.value = current;
    }
  }
}

function refreshLiveAlarms(site, dash) {
  if (!site) return;
  state.site = site;
  if (dash) state.dash = dash;
  state.alarmSig = alarmSignature(site);
  applyStatusHero(site);
  setText("sf-sum-alert", String(dash?.alertCount ?? openAlarms(site.soc).length));
  renderAlarms(site);
  renderLogs(site);
  renderKpi(site, state.dash);
  try {
    if (window.TislySecurityIso3d?.setAlert) {
      window.TislySecurityIso3d.setAlert(
        !!site.hasAlert || openAlarms(site.soc).length > 0
      );
    }
  } catch (_e) {
    /* ignore */
  }
}

function renderSite(site, dash) {
  if (!site) return;
  try {
    state.site = site;
    state.dash = dash || state.dash || { alertCount: 0 };
    state.alarmSig = alarmSignature(site);
    applyStatusHero(site);
    syncHeaderTitle(site);
    setText(
      "sf-plan",
      `${site.planCode || "home_security_std"} / ${site.planStatus || "active"} / ${site.currency || "JPY"}`
    );
    setHtml(
      "sf-property",
      `<strong>板橋自宅 (HOME-JP-ITABASHI-LIVE)</strong><br>${site.addressLabel || "東京都板橋区"}`
    );
    const w = site.soc?.weather;
    if (w) {
      setText(
        "sf-weather",
        `${w.tempC}℃ · ${w.label} · 湿度 ${w.humidity}% · 風 ${w.windMs}m/s`
      );
    }
    const floors = site.floors || [];
    setHtml("sf-floor-tabs", renderSocLayerButtons(floors, state.floorId, site));
    const mapOpts = {
      showCameras: false,
      showSensors: state.showSensors,
      showZones: state.showZones,
      showLabels: state.showLabels,
    };
    setHtml(
      "sf-map-wrap",
      renderIsoStack(site, state.floorId, mapOpts)
    );
    setHtml("sf-modes", renderGuardModes(site.guardMode));
    setHtml(
      "sf-notes",
      (site.notes || []).map((n) => `<li>${n}</li>`).join("")
    );
    renderKpi(site, state.dash);
    renderAlarms(site);
    renderLogs(site);
    bindSecurityOrbit();
    applySecurityOrbit();
    setSecurityDrumFloor(state.floorId);
    updateSecurityIso3d(site, state.floorId, mapOpts).catch((e) => {
      console.warn("[security-floor] iso3d", e);
    });
    markSecurityUiReady();
  } catch (err) {
    setText("sf-status-label", "表示を再構築しました");
    console.warn("[security-floor]", err);
  }
}

function bootFallback() {
  const bundle = getFallbackOperatorBundle(state.siteId);
  fillSiteSelect(bundle.dashboard.sites);
  setText("sf-sum-total", String(bundle.dashboard.totalSites));
  setText("sf-sum-alert", String(bundle.dashboard.alertCount));
  renderSite(bundle.site, bundle.dashboard);
}

async function loadOperator(opts = {}) {
  const soft = !!opts.soft;
  const t0 = performance.now();
  try {
    const data = await fetchJson(
      `/api/security-floor/v1/operator?siteId=${encodeURIComponent(state.siteId)}`
    );
    const rttMs = Math.max(0, Math.round(performance.now() - t0));
    const sites = (data.dashboard?.sites || []).map((s) => ({
      id: s.siteId || s.id,
      siteId: s.siteId || s.id,
      displayName: s.displayName,
      countryCode: s.countryCode,
    }));
    if (!soft) {
      fillSiteSelect(sites.length ? sites : listFallbackSites());
      setText("sf-sum-total", String(data.dashboard?.totalSites ?? sites.length));
    }
    setText("sf-sum-alert", String(data.dashboard?.alertCount ?? 0));
    if (data.site) {
      if (!data.site.soc) data.site.soc = {};
      data.site.soc.networkMs = rttMs;
      const nextSig = alarmSignature(data.site);
      if (soft && state.site && nextSig === state.alarmSig) {
        /* 発報変化なしでも遅延・ハートビートは更新 */
        state.site.soc = { ...state.site.soc, ...data.site.soc, networkMs: rttMs };
        renderKpi(state.site, data.dashboard || state.dash);
        return;
      }
      if (soft && state.site) {
        refreshLiveAlarms(data.site, data.dashboard);
      } else {
        renderSite(data.site, data.dashboard);
      }
    }
  } catch (err) {
    if (!state.site) bootFallback();
    if (!soft) {
      setText("sf-online", "● オフライン（モック）");
    }
    console.warn("[security-floor] API fallback", err);
  }
}

function startAlarmPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    loadOperator({ soft: true }).catch(() => {});
  }, 2000);
}

async function setMode(mode) {
  try {
    const data = await fetchJson("/api/security-floor/v1/guard-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: state.siteId, mode }),
    });
    renderSite(data.operatorSite || applyLocalGuardMode(state.site, mode), state.dash);
  } catch {
    renderSite(applyLocalGuardMode(state.site, mode), state.dash);
  }
}

async function toggleLivingAlert() {
  try {
    const data = await fetchJson("/api/security-floor/v1/test-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: state.siteId }),
    });
    const site = data.operatorSite || applyLocalPrimaryAlert(state.site);
    if (site?.hasAlert) state.floorId = "1f";
    renderSite(site, state.dash);
    if (data.push && data.push.success === false) {
      const msg =
        data.push.hint ||
        data.push.error ||
        "Push 送信失敗";
      window.alert(`通知テスト: ${msg}`);
    }
  } catch {
    const site = applyLocalPrimaryAlert(state.site);
    if (site?.hasAlert) state.floorId = "1f";
    renderSite(site, state.dash);
  }
}

async function ackAlarms() {
  try {
    const data = await fetchJson("/api/security-floor/v1/alarm-ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: state.siteId }),
    });
    refreshLiveAlarms(
      data.operatorSite || applyLocalAck(state.site),
      data.dashboard || state.dash
    );
  } catch {
    refreshLiveAlarms(applyLocalAck(state.site), state.dash);
  }
}

async function setLights(on) {
  try {
    const data = await fetchJson("/api/security-floor/v1/lighting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: state.siteId, on }),
    });
    renderSite(data.operatorSite || applyLocalLights(state.site, on), state.dash);
  } catch {
    renderSite(applyLocalLights(state.site, on), state.dash);
  }
}

function exportReport() {
  const site = state.site;
  if (!site) return;
  const lines = [
    "時刻,フロア,場所,種別,デバイス,ステータス,対応者",
    ...(site.soc?.alarmLogs || []).map((l) =>
      [
        l.at,
        socFloorLabel(l.floorId),
        l.location,
        l.kindLabel,
        l.deviceLabel,
        l.status,
        l.handler,
      ].join(",")
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tisly-alarm-log-${site.siteId || site.id}.csv`;
  a.click();
}

function bind() {
  document.addEventListener("tisly-sf-floor", (e) => {
    const id = e.detail?.id;
    if (id) state.floorId = id;
  });
  $("sf-site-select")?.addEventListener("change", (e) => {
    // UI は板橋固定。他 ID が来ても板橋へ戻す
    const next = e.target.value;
    state.siteId =
      next === "SEC-JP-ITABASHI-LIVE"
        ? next
        : "SEC-JP-ITABASHI-LIVE";
    e.target.value = state.siteId;
    bootFallback();
    loadOperator().catch(() => {});
    refreshSecurityRemoteConfigV1(state.siteId).catch(() => {});
  });

  // light-v1 が先に CTRL_BOUND を立てても、警報ポーリングと ACK は必ず動かす
  const bindAlarmControls = () => {
    if (window.__TISLY_SF_ALARM_BOUND) return;
    window.__TISLY_SF_ALARM_BOUND = true;
    $("sf-demo-alert")?.addEventListener("click", () => {
      toggleLivingAlert().catch(() => {});
    });
    $("sf-ack")?.addEventListener("click", () => {
      ackAlarms().catch(() => {});
    });
  };
  bindAlarmControls();

  if (window.__TISLY_SF_CTRL_BOUND) {
    startAlarmPolling();
    return;
  }
  $("sf-floor-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-floor]");
    if (!btn || btn.disabled) return;
    state.floorId = btn.getAttribute("data-floor");
    if (state.site) renderSite(state.site, state.dash);
  });
  $("sf-modes")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    setMode(btn.getAttribute("data-mode")).catch(() => {});
  });
  $("sf-light-on")?.addEventListener("click", () => {
    setLights(true).catch(() => {});
  });
  $("sf-light-off")?.addEventListener("click", () => {
    setLights(false).catch(() => {});
  });
  $("sf-export")?.addEventListener("click", exportReport);
  $("sf-log-csv")?.addEventListener("click", exportReport);
  $("sf-log-open-detail")?.addEventListener("click", () => {
    $("sf-log-dialog")?.showModal?.();
  });
  $("sf-opt-sens")?.addEventListener("change", (e) => {
    state.showSensors = e.target.checked;
    if (state.site) renderSite(state.site, state.dash);
  });
  $("sf-opt-zone")?.addEventListener("change", (e) => {
    state.showZones = e.target.checked;
    if (state.site) renderSite(state.site, state.dash);
  });
  $("sf-opt-label")?.addEventListener("change", (e) => {
    state.showLabels = e.target.checked;
    if (state.site) renderSite(state.site, state.dash);
  });
  $("sf-log-kind")?.addEventListener("change", (e) => {
    state.logKind = e.target.value;
    if (state.site) renderLogs(state.site);
  });
  $("sf-log-floor")?.addEventListener("change", (e) => {
    state.logFloor = e.target.value;
    if (state.site) renderLogs(state.site);
  });
  $("sf-log-q")?.addEventListener("input", (e) => {
    state.logQ = e.target.value;
    if (state.site) renderLogs(state.site);
  });
  $("sf-log-date")?.addEventListener("change", (e) => {
    state.logDate = e.target.value;
    if (state.site) renderLogs(state.site);
  });
  document.querySelectorAll(".sf-mobile-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.pane = btn.getAttribute("data-pane");
      document
        .querySelectorAll(".sf-mobile-tabs button")
        .forEach((b) => b.classList.toggle("is-on", b === btn));
      document.body.setAttribute("data-pane", state.pane);
      const target = document.querySelector(
        `.sf-soc-shell [data-pane="${state.pane}"]`
      );
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  startAlarmPolling();
}

try {
  bind();
  tickClock();
  setInterval(tickClock, 1000);
  bootFallback();
  loadOperator().catch(() => {});
} catch (err) {
  bootFallback();
  console.warn("[security-floor] boot", err);
}

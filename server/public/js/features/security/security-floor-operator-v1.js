/**
 * 社内向けダークSOC
 * 3D俯瞰 · 発報連動 · ログ
 */

import {
  formatAlarmTime,
  renderGuardModes,
  renderIsoStack,
  renderSocLayerButtons,
  socFloorLabel,
} from "./security-floor-map-v1.js";

const state = {
  siteId: "SEC-JP-TSUKUBA-001",
  floorId: "all",
  site: null,
  dash: null,
  cameraId: null,
  showCameras: true,
  showSensors: true,
  showZones: true,
  showLabels: true,
  logKind: "",
  logFloor: "",
  logQ: "",
  pane: "map",
};

function $(id) {
  return document.getElementById(id);
}

async function fetchJson(url, opts) {
  const res = await fetch(url, {
    cache: "no-store",
    ...opts,
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || "読込失敗");
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

function fillSiteSelect(sites) {
  const sel = $("sf-site-select");
  if (!sel) return;
  sel.innerHTML = sites
    .map(
      (s) =>
        `<option value="${s.id}">${s.displayName}（${s.countryCode}）</option>`
    )
    .join("");
  sel.value = state.siteId;
}

function openAlarms(soc) {
  return (soc?.alarmLogs || []).filter(
    (l) => l.status !== "done"
  );
}

function setLiveScene(cameraId, soc) {
  const feed = $("sf-live-feed");
  const xl = $("sf-live-xl");
  const cam = (soc?.cameras || []).find(
    (c) => c.id === cameraId
  );
  const scene = cam?.scene || "lobby";
  if (feed) {
    feed.className = `sf-live-feed scene-${scene}`;
    feed.innerHTML =
      `<span class="sf-live-badge">LIVE</span><div class="sf-scan"></div>`;
  }
  if (xl) {
    xl.className = `sf-live-feed is-xl scene-${scene}`;
  }
  if ($("sf-cam-title")) {
    $("sf-cam-title").textContent = cam
      ? `ライブカメラ · ${cam.label}`
      : "ライブカメラ";
  }
}

function renderKpi(site, dash) {
  const soc = site.soc || {};
  const cams = (site.sensors || []).filter(
    (s) => s.kind === "camera"
  );
  const sens = (site.sensors || []).filter(
    (s) => s.kind !== "camera"
  );
  const okSens = sens.filter((s) => !s.alertVisible).length;
  const html = [
    [
      "セキュリティ",
      site.hasAlert ? "発報" : "正常",
      `アラーム ${dash.alertCount}件`,
      site.hasAlert ? "alert" : "ok",
    ],
    [
      "カメラ",
      `${cams.length} / ${cams.length} 台 オンライン`,
      "LIVE",
      "info",
    ],
    [
      "センサー",
      `${okSens} / ${sens.length} 正常`,
      "",
      site.hasAlert ? "alert" : "ok",
    ],
    [
      "スマート照明",
      `${soc.lightingOn ?? 0} / ${soc.lightingTotal ?? 8} 台`,
      "点灯中",
      "info",
    ],
    [
      "消費電力",
      `${soc.energyKw ?? 0} kW`,
      `日次最大 ${soc.energyMaxKw ?? 0} kW`,
      "info",
    ],
    [
      "ネットワーク",
      "正常",
      `遅延 ${soc.networkMs ?? 12} ms`,
      "ok",
    ],
  ]
    .map(
      (row) => `<article class="sf-kpi ${row[3]}">
        <p>${row[0]}</p><strong>${row[1]}</strong><span>${row[2]}</span>
      </article>`
    )
    .join("");
  if ($("sf-kpi")) $("sf-kpi").innerHTML = html;
}

function renderAlarms(site) {
  const soc = site.soc || {};
  const open = openAlarms(soc);
  if ($("sf-alarm-count")) {
    $("sf-alarm-count").textContent =
      `${open.length}件発生中`;
  }
  if ($("sf-bell-count")) {
    $("sf-bell-count").textContent = String(open.length);
  }
  if ($("sf-alarm-list")) {
    $("sf-alarm-list").innerHTML = open
      .slice(0, 6)
      .map(
        (a) => `<li data-sensor="${a.sensorId}" data-cam="${a.cameraId || ""}">
          <b>${a.location}</b>
          <span>${a.kindLabel} · ${formatAlarmTime(a.at)}</span>
        </li>`
      )
      .join("") || "<li>発報はありません</li>";
  }
  const top = open[0];
  if ($("sf-alarm-detail")) {
    $("sf-alarm-detail").innerHTML = top
      ? `<div><dt>時刻</dt><dd>${formatAlarmTime(top.at)}</dd></div>
         <div><dt>デバイス</dt><dd>${top.deviceLabel}</dd></div>
         <div><dt>種別</dt><dd>${top.kindLabel}</dd></div>
         <div><dt>ステータス</dt><dd><em class="st-open">未対応</em></dd></div>
         <div><dt>場所</dt><dd>${top.location}</dd></div>
         <div><dt>フロア</dt><dd>${socFloorLabel(top.floorId)}</dd></div>`
      : "<p>選択中の警報はありません</p>";
  }
}

function renderLogs(site) {
  const logs = [...(site.soc?.alarmLogs || [])];
  const body = $("sf-log-body");
  if (!body) return;
  const kind = state.logKind;
  const floor = state.logFloor;
  const q = state.logQ.trim();
  const rows = logs.filter((l) => {
    if (kind && l.kindLabel !== kind) return false;
    if (floor && l.floorId !== floor) return false;
    if (
      q &&
      !`${l.location}${l.deviceLabel}${l.kindLabel}`.includes(q)
    ) {
      return false;
    }
    return true;
  });
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
  const fl = $("sf-log-floor");
  if (fl && fl.options.length <= 1) {
    (site.floors || []).forEach((f) => {
      const op = document.createElement("option");
      op.value = f.id;
      op.textContent = socFloorLabel(f.id, f.label);
      fl.appendChild(op);
    });
  }
}

function renderThumbs(site) {
  const wrap = $("sf-cam-thumbs");
  if (!wrap) return;
  const cams = site.soc?.cameras || [];
  wrap.innerHTML = cams
    .map(
      (c) => `<button type="button" class="sf-thumb scene-${c.scene}${
        c.id === state.cameraId ? " is-on" : ""
      }" data-cam="${c.id}">${c.label}</button>`
    )
    .join("");
}

function renderSite(site, dash) {
  state.site = site;
  state.dash = dash;
  $("sf-status-emoji").textContent = site.hasAlert
    ? "🔴"
    : "🟢";
  $("sf-status-label").textContent = site.hasAlert
    ? "発報があります"
    : "正常です";
  if ($("sf-plan")) {
    $("sf-plan").textContent =
      `${site.planCode} / ${site.planStatus} / ${site.currency}`;
  }
  if ($("sf-property")) {
    $("sf-property").innerHTML =
      `<strong>${site.displayName}</strong><br>${site.addressLabel}`;
  }
  const w = site.soc?.weather;
  if ($("sf-weather") && w) {
    $("sf-weather").textContent =
      `${w.tempC}℃ · ${w.label} · 湿度 ${w.humidity}% · 風 ${w.windMs}m/s`;
  }
  const floors = site.floors || [];
  $("sf-floor-tabs").innerHTML = renderSocLayerButtons(
    floors,
    state.floorId
  );
  $("sf-map-wrap").innerHTML = renderIsoStack(site, state.floorId, {
    showCameras: state.showCameras,
    showSensors: state.showSensors,
    showZones: state.showZones,
    showLabels: state.showLabels,
  });
  $("sf-modes").innerHTML = renderGuardModes(site.guardMode);
  $("sf-notes").innerHTML = (site.notes || [])
    .map((n) => `<li>${n}</li>`)
    .join("");
  if (!state.cameraId) {
    state.cameraId = site.soc?.selectedCameraId || null;
  }
  setLiveScene(state.cameraId, site.soc);
  renderKpi(site, dash || { alertCount: 0 });
  renderAlarms(site);
  renderLogs(site);
  renderThumbs(site);
}

async function loadOperator() {
  const data = await fetchJson(
    `/api/security-floor/v1/operator?siteId=${encodeURIComponent(state.siteId)}`
  );
  fillSiteSelect(
    data.dashboard.sites.map((s) => ({
      id: s.siteId,
      displayName: s.displayName,
      countryCode: s.countryCode,
    }))
  );
  $("sf-sum-total").textContent = String(
    data.dashboard.totalSites
  );
  $("sf-sum-alert").textContent = String(
    data.dashboard.alertCount
  );
  renderSite(data.site, data.dashboard);
}

async function setMode(mode) {
  const data = await fetchJson(
    "/api/security-floor/v1/guard-mode",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: state.siteId,
        mode,
      }),
    }
  );
  renderSite(data.operatorSite, state.dash);
}

async function toggleLivingAlert() {
  const data = await fetchJson(
    "/api/security-floor/v1/test-notify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: state.siteId }),
    }
  );
  state.cameraId = data.operatorSite.soc?.selectedCameraId;
  renderSite(data.operatorSite, state.dash);
}

async function ackAlarms() {
  const data = await fetchJson(
    "/api/security-floor/v1/alarm-ack",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: state.siteId }),
    }
  );
  renderSite(data.operatorSite, state.dash);
}

async function setLights(on) {
  const data = await fetchJson(
    "/api/security-floor/v1/lighting",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: state.siteId, on }),
    }
  );
  renderSite(data.operatorSite, state.dash);
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
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tisly-alarm-log-${site.siteId}.csv`;
  a.click();
}

function bind() {
  $("sf-site-select")?.addEventListener("change", (e) => {
    state.siteId = e.target.value;
    state.cameraId = null;
    loadOperator().catch(() => {});
  });
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
  $("sf-demo-alert")?.addEventListener("click", () => {
    toggleLivingAlert().catch(() => {});
  });
  $("sf-ack")?.addEventListener("click", () => {
    ackAlarms().catch(() => {});
  });
  $("sf-light-on")?.addEventListener("click", () => {
    setLights(true).catch(() => {});
  });
  $("sf-light-off")?.addEventListener("click", () => {
    setLights(false).catch(() => {});
  });
  $("sf-export")?.addEventListener("click", exportReport);
  $("sf-opt-cam")?.addEventListener("change", (e) => {
    state.showCameras = e.target.checked;
    if (state.site) renderSite(state.site, state.dash);
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
  $("sf-cam-thumbs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cam]");
    if (!btn) return;
    state.cameraId = btn.getAttribute("data-cam");
    setLiveScene(state.cameraId, state.site?.soc);
    renderThumbs(state.site);
  });
  $("sf-map-wrap")?.addEventListener("click", (e) => {
    const pin = e.target.closest("[data-camera]");
    if (!pin) return;
    state.cameraId = pin.getAttribute("data-camera");
    setLiveScene(state.cameraId, state.site?.soc);
    renderThumbs(state.site);
  });
  $("sf-cam-next")?.addEventListener("click", () => {
    const cams = state.site?.soc?.cameras || [];
    if (!cams.length) return;
    const i = cams.findIndex((c) => c.id === state.cameraId);
    state.cameraId = cams[(i + 1) % cams.length].id;
    setLiveScene(state.cameraId, state.site.soc);
    renderThumbs(state.site);
  });
  $("sf-cam-expand")?.addEventListener("click", () => {
    $("sf-play-note").hidden = true;
    $("sf-live-dialog")?.showModal();
  });
  $("sf-cam-play")?.addEventListener("click", () => {
    $("sf-play-note").hidden = false;
    $("sf-live-dialog")?.showModal();
  });
  document.querySelectorAll(".sf-mobile-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.pane = btn.getAttribute("data-pane");
      document
        .querySelectorAll(".sf-mobile-tabs button")
        .forEach((b) => b.classList.toggle("is-on", b === btn));
      document.body.setAttribute("data-pane", state.pane);
    });
  });
}

bind();
tickClock();
setInterval(tickClock, 1000);
loadOperator().catch((err) => {
  $("sf-status-label").textContent =
    err.message || "読み込めませんでした";
});

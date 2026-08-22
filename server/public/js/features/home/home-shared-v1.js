/**
 * TiSLY HOME 共通描画 v1
 *
 * 社内画面とお客様画面で同じ描画関数を使う。
 * 要素が無いページでも落ちないよう
 * すべて null ガードする。
 */

export const HOME_API_V1 = "/api/home/v1";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function byId(id) {
  return document.getElementById(id);
}

export function setText(id, text) {
  const el = byId(id);
  if (el) el.textContent = String(text ?? "—");
}

export function setHtml(id, html) {
  const el = byId(id);
  if (el) el.innerHTML = html;
}

/** 画面下のトースト通知 */
let toastTimer = null;
export function showToast(message) {
  const el = byId("hm-toast");
  if (!el) return;
  el.textContent = String(message ?? "");
  el.classList.add("is-visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("is-visible");
  }, 2600);
}

/* ---------- API ---------- */

export async function fetchHomeCustomer(siteId) {
  const query = siteId
    ? `?siteId=${encodeURIComponent(siteId)}`
    : "";
  const res = await fetch(`${HOME_API_V1}/customer${query}`, {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "読込に失敗しました");
  return data.dashboard;
}

/** お客様向け物件一覧（シンプル） */
export async function fetchHomeCustomerSites() {
  const res = await fetch(`${HOME_API_V1}/customer-sites`, {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "読込に失敗しました");
  return data.sites;
}

export async function fetchHomeOperator() {
  const res = await fetch(`${HOME_API_V1}/operator`, {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "読込に失敗しました");
  return data.dashboard;
}

export async function sendHomeControl(payload) {
  const res = await fetch(`${HOME_API_V1}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "操作に失敗しました");
  return data;
}

/** 総合システムログ */
export async function fetchSystemLogs(siteId, limit = 30) {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  params.set("limit", String(limit));
  const res = await fetch(`/api/logs?${params.toString()}`, {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "ログ取得に失敗しました");
  return data.logs || [];
}

/** 風呂予約一覧 */
export async function fetchBathSchedules(siteId) {
  const res = await fetch(
    `${HOME_API_V1}/bath-schedules?siteId=${encodeURIComponent(siteId)}`,
    { cache: "no-store" }
  );
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "予約取得に失敗しました");
  return data;
}

/** 風呂予約作成 */
export async function createBathSchedule(payload) {
  const res = await fetch(`${HOME_API_V1}/bath-schedules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "予約に失敗しました");
  return data.schedule;
}

/** 風呂予約キャンセル */
export async function cancelBathSchedule(siteId, scheduleId, actor) {
  const res = await fetch(
    `${HOME_API_V1}/bath-schedules/${scheduleId}?siteId=${encodeURIComponent(siteId)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, actor }),
    }
  );
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "キャンセルに失敗しました");
  return data;
}

let bathCountdownTimer = null;
let bathCountdownEndMs = 0;

function formatClientCountdown(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function stopBathCountdownTimer() {
  if (bathCountdownTimer) {
    clearInterval(bathCountdownTimer);
    bathCountdownTimer = null;
  }
  bathCountdownEndMs = 0;
}

function startBathCountdownTimer(endIso) {
  stopBathCountdownTimer();
  if (!endIso) return;
  const endMs = Date.parse(endIso);
  if (Number.isNaN(endMs)) return;
  bathCountdownEndMs = endMs;

  const tick = () => {
    const remainSec = Math.max(0, Math.ceil((bathCountdownEndMs - Date.now()) / 1000));
    const label = formatClientCountdown(remainSec);
    setText("hm-bath-countdown", label);
    setText("hm-bath-state", `湯はり中（残り ${label}）`);
    const pulse = byId("hm-bath-pulse-status");
    if (pulse && remainSec > 0) {
      pulse.textContent = `湯はり中 · 残り ${label}`;
      pulse.classList.add("is-filling");
    }
    if (remainSec <= 0) stopBathCountdownTimer();
  };
  tick();
  bathCountdownTimer = setInterval(tick, 1000);
}

/* ---------- 共通描画 ---------- */

export function renderStatusHero(d, options = {}) {
  const plain = Boolean(options.plain);
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
  setText(
    "hm-status-meta",
    plain ? d.displayName : `${d.displayName} · ${d.addressLabel}`
  );
}

function levelClass(level) {
  if (level === "alert") return "is-alert";
  if (level === "warning") return "is-warning";
  return "";
}

/**
 * 分電盤CT
 * withControls=true で回路のON/OFFを表示
 */
export function renderCt(d, options = {}) {
  const plain = Boolean(options.plain);
  const ct = d.ct;
  const value = byId("hm-ct-current");
  if (value) {
    value.textContent = Number(ct.mainCurrentA).toFixed(1);
    value.classList.remove("is-warning", "is-alert");
    const cls = levelClass(ct.level);
    if (cls) value.classList.add(cls);
  }
  if (plain) {
    setText(
      "hm-ct-power",
      `いま ${Number(ct.powerKw).toFixed(1)} kW つかっています`
    );
    setText("hm-ct-note", ct.levelLabel);
  } else {
    setText(
      "hm-ct-power",
      `${Number(ct.powerKw).toFixed(1)} kW / ${ct.powerW} W · ` +
        `契約 ${ct.contractDemandKw} kW（${ct.demandPercent}%）`
    );
    setText(
      "hm-ct-note",
      `${d.voltageSpec} · 主幹 ${ct.mainCapacityA}A · ${ct.levelLabel}`
    );
  }

  const bar = byId("hm-ct-bar");
  if (bar) {
    bar.style.width = `${Math.min(100, ct.loadPercent)}%`;
    bar.classList.remove("is-warning", "is-alert");
    const cls = levelClass(ct.level);
    if (cls) bar.classList.add(cls);
  }
  if (plain) {
    setText("hm-ct-warn", `気をつける目安 ${ct.warnThresholdA} A`);
    setText("hm-ct-alert", `止まる目安 ${ct.alertThresholdA} A`);
  } else {
    setText("hm-ct-warn", `警告 ${ct.warnThresholdA} A`);
    setText("hm-ct-alert", `遮断 ${ct.alertThresholdA} A`);
  }
  setText("hm-ct-demand", Number(ct.powerKw).toFixed(1));
  setText(
    "hm-ct-load",
    plain
      ? Math.max(0, 100 - Math.round(ct.loadPercent))
      : `${ct.loadPercent}`
  );
  setText(
    "hm-ct-peak",
    ct.peakCutActive
      ? plain
        ? "はたらき中"
        : "作動中"
      : plain
        ? "おやすみ"
        : "待機"
  );

  const solarWrap = byId("hm-ct-solar-wrap");
  if (solarWrap) {
    solarWrap.hidden = !ct.hasSolar;
    setText(
      "hm-ct-solar",
      plain
        ? `☀️ 太陽光 ${ct.solarGenerationW} W`
        : `☀️ 太陽光 ${ct.solarGenerationW} W`
    );
  }

  const list = byId("hm-circuit-list");
  if (!list) return;
  if (!ct.circuits.length) {
    list.innerHTML = '<p class="hm-empty">回路がありません</p>';
    return;
  }
  list.innerHTML = ct.circuits
    .map((c) => {
      const rowCls = c.on ? "hm-circuit-row" : "hm-circuit-row is-off";
      const badge = c.on
        ? '<span class="hm-badge hm-badge-ok">使っています</span>'
        : '<span class="hm-badge hm-badge-mute">停止</span>';
      const peak =
        !plain && c.peakCutTarget
          ? ' · <span class="hm-peak-tag">ピーク対象</span>'
          : "";
      const meta = plain
        ? `<small>${escapeHtml(c.statusLabel ?? (c.on ? "使っています" : "停止"))}</small>`
        : `<small>${c.voltage}V · ${Number(c.currentA).toFixed(1)}A${peak}</small>`;
      const control = options.withControls
        ? `<button
             type="button"
             class="hm-btn ${c.on ? "is-on" : "is-off"}"
             data-target="circuit"
             data-action="relay"
             data-device="${escapeHtml(c.id)}"
             data-value="${c.on ? "false" : "true"}"
           >${c.on ? "ON" : "OFF"}</button>`
        : badge;
      return `
        <div class="${rowCls}">
          <div class="hm-circuit-meta">
            ${escapeHtml(c.label)}
            ${meta}
          </div>
          ${control}
        </div>`;
    })
    .join("");
}

/** 風呂リモコン */
export function renderBath(d, options = {}) {
  const plain = Boolean(options.plain);
  const b = d.bath;
  const oneshot = b.uiProfile === "oneshot_autofill";
  const bathCard = byId("hm-bath-card") || byId("hm-detail-stack");
  if (bathCard) {
    bathCard.classList.toggle("is-oneshot-bath", oneshot);
  }
  document
    .querySelectorAll("[data-bath-demo-only]")
    .forEach((el) => {
      el.hidden = oneshot;
    });

  const tempHero = byId("hm-bath-temp-hero");
  if (tempHero) tempHero.hidden = oneshot;
  const fillBar = byId("hm-bath-fill-wrap");
  if (fillBar) fillBar.hidden = oneshot;

  setText(
    "hm-bath-temp",
    oneshot ? "—" : Number(b.setTempC).toFixed(0)
  );
  setText(
    "hm-bath-state",
    oneshot
      ? b.fillState === "filling" && b.countdownLabel
        ? `湯はり中（残り ${b.countdownLabel}）`
        : b.lastPulseMessage || b.fillStateLabel || "待機中"
      : `${b.fillStateLabel}${b.reheating ? " · 追いだき中" : ""}` +
          `${b.keepWarm ? " · 保温ON" : ""}`
  );
  setText(
    "hm-bath-countdown",
    oneshot && b.fillState === "filling" && b.countdownLabel
      ? b.countdownLabel
      : "—"
  );
  setText(
    "hm-bath-current",
    oneshot
      ? "実機ワンショット制御"
      : plain
        ? `いまの湯温 ${Number(b.currentTempC).toFixed(1)} ℃`
        : `浴槽 ${Number(b.currentTempC).toFixed(1)} ℃`
  );
  setText(
    "hm-bath-percent",
    oneshot
      ? `DO CH${b.relayChannel || 1} · ${b.pulseDurationMs || 500}ms`
      : plain
        ? `たまり具合 ${b.fillPercent}%`
        : `湯はり ${b.fillPercent}%`
  );
  setText(
    "hm-bath-note",
    oneshot
      ? plain
        ? "お湯はりの自動ボタン"
        : `${d.deviceBoardLabel || "RP2350"} · DO CH${b.relayChannel || 1}`
      : plain
        ? b.fillStateLabel
        : `${d.hotWaterSpec} · ${b.linkStateLabel}`
  );
  const linkEl = byId("hm-bath-link");
  if (linkEl) {
    if (plain) {
      linkEl.hidden = true;
      linkEl.textContent = "";
    } else {
      linkEl.hidden = false;
      linkEl.textContent = oneshot
        ? `${b.jemaTerminal} / RP2350 ${b.relayPort} — ${b.linkStateLabel}`
        : `${b.jemaTerminal} / RP2350 ${b.relayPort} — ${b.linkStateLabel}`;
    }
  }

  const bar = byId("hm-bath-bar");
  if (bar) {
    bar.style.width = oneshot
      ? "0%"
      : `${Math.min(100, b.fillPercent)}%`;
  }

  const autoBtn = byId("hm-bath-autofill");
  if (autoBtn) {
    if (oneshot) {
      autoBtn.classList.remove("is-on", "is-off");
      autoBtn.classList.add("is-oneshot");
      autoBtn.textContent = "♨️ お湯はり（自動ボタン）";
      autoBtn.dataset.value = "true";
      autoBtn.removeAttribute("hidden");
    } else {
      autoBtn.classList.remove("is-oneshot");
      toggleStateBtn("hm-bath-autofill", b.autoFill, "自動お湯はり");
    }
  }
  if (!oneshot) {
    toggleStateBtn("hm-bath-reheat", b.reheating, "追いだき");
    toggleStateBtn("hm-bath-keepwarm", b.keepWarm, "ふろ保温");
  }

  const statusEl = byId("hm-bath-pulse-status");
  const countdownEl = byId("hm-bath-countdown");
  if (countdownEl) {
    countdownEl.hidden = !(oneshot && b.fillState === "filling");
  }
  if (statusEl) {
    statusEl.hidden = !oneshot;
    if (oneshot) {
      if (b.fillState === "filling" && b.countdownLabel) {
        statusEl.textContent = `湯はり中 · 残り ${b.countdownLabel}`;
        statusEl.classList.add("is-filling");
        statusEl.classList.remove("is-done");
      } else {
        statusEl.textContent =
          b.lastPulseMessage || "待機中（タップで湯はり指令）";
        statusEl.classList.toggle("is-done", b.fillState === "done");
        statusEl.classList.remove("is-filling");
      }
    }
  }

  if (oneshot && b.fillState === "filling" && b.fillEstimatedEndAt) {
    startBathCountdownTimer(b.fillEstimatedEndAt);
  } else {
    stopBathCountdownTimer();
  }
}

function toggleStateBtn(id, active, label) {
  const btn = byId(id);
  if (!btn) return;
  btn.classList.remove("is-on", "is-off");
  btn.classList.add(active ? "is-on" : "is-off");
  btn.textContent = `${label} ${active ? "ON" : "OFF"}`;
  btn.dataset.value = active ? "false" : "true";
}

const AC_MODES_V1 = [
  { key: "cool", label: "冷房" },
  { key: "heat", label: "暖房" },
  { key: "dry", label: "除湿" },
  { key: "fan", label: "送風" },
];

/** エアコン */
export function renderAircons(d, options = {}) {
  const root = byId("hm-aircon-list");
  if (!root) return;
  setText(
    "hm-aircon-note",
    `${d.activeAirconCount} / ${d.aircons.length} 台 運転中`
  );
  if (!d.aircons.length) {
    root.innerHTML = '<p class="hm-empty">エアコンがありません</p>';
    return;
  }
  root.innerHTML = d.aircons
    .map((ac) => {
      const key = escapeHtml(ac.deviceKey);
      const powerBadge = ac.power
        ? '<span class="hm-badge hm-badge-ok">運転中</span>'
        : '<span class="hm-badge hm-badge-mute">停止</span>';
      const peakBadge = ac.peakSaveActive
        ? '<span class="hm-badge hm-badge-warn">ピーク自動セーブ</span>'
        : "";
      const controls = options.withControls
        ? `
        <div class="hm-ac-temp-row">
          <button
            type="button"
            class="hm-step-btn"
            data-target="aircon"
            data-action="temp_down"
            data-device="${key}"
            aria-label="設定温度を下げる"
          >−</button>
          <div class="hm-ac-set-temp">
            ${Number(ac.setTempC).toFixed(0)}℃
            <small>設定温度</small>
          </div>
          <button
            type="button"
            class="hm-step-btn"
            data-target="aircon"
            data-action="temp_up"
            data-device="${key}"
            aria-label="設定温度を上げる"
          >＋</button>
        </div>
        <input
          class="hm-slider"
          type="range"
          min="16"
          max="32"
          step="1"
          value="${Number(ac.setTempC).toFixed(0)}"
          data-target="aircon"
          data-action="set_temp"
          data-device="${key}"
          aria-label="設定温度スライダー"
        />
        <div class="hm-mode-row">
          ${AC_MODES_V1.map(
            (m) => `
            <button
              type="button"
              class="hm-mode-btn ${
                ac.mode === m.key ? "is-active" : ""
              }"
              data-target="aircon"
              data-action="mode"
              data-device="${key}"
              data-value="${m.key}"
            >${m.label}</button>`
          ).join("")}
        </div>
        <div class="hm-btn-row hm-btn-row-2">
          <button
            type="button"
            class="hm-btn ${ac.power ? "is-on" : "is-off"}"
            data-target="aircon"
            data-action="power"
            data-device="${key}"
            data-value="${ac.power ? "false" : "true"}"
          >電源 ${ac.power ? "ON" : "OFF"}</button>
          <button
            type="button"
            class="hm-btn ${
              ac.peakSaveActive ? "is-on" : "is-off"
            }"
            data-target="aircon"
            data-action="peak_save"
            data-device="${key}"
            data-value="${ac.peakSaveActive ? "false" : "true"}"
          >ピーク自動セーブ</button>
        </div>`
        : `
        <div class="hm-plain-row">
          <span>設定温度</span>
          <strong>${Number(ac.setTempC).toFixed(0)} ℃</strong>
        </div>`;

      return `
        <div class="hm-ac-block">
          <div class="hm-ac-head">
            <div>
              <h3 class="hm-ac-name">${escapeHtml(ac.label)}</h3>
              <p class="hm-device-note">
                室温 ${Number(ac.roomTempC).toFixed(1)}℃ ·
                ${escapeHtml(ac.modeLabel)} ·
                風量${escapeHtml(ac.fanLabel)} ·
                風向${escapeHtml(ac.swingLabel)}${
                  options.plain || ac.powerW == null
                    ? ""
                    : ` · ${ac.powerW}W`
                }
              </p>
            </div>
            <div>${powerBadge}${peakBadge}</div>
          </div>
          ${controls}
        </div>`;
    })
    .join("");
}

/** 玄関スマートロック */
export function renderLock(d, options = {}) {
  const plain = Boolean(options.plain);
  const l = d.lock;
  setText("hm-lock-emoji", l.lockEmoji);
  const state = byId("hm-lock-state");
  if (state) {
    state.textContent = l.lockLabel;
    state.classList.remove("is-locked", "is-unlocked");
    state.classList.add(l.locked ? "is-locked" : "is-unlocked");
  }
  setText(
    "hm-lock-door",
    plain
      ? `${l.doorLabel} · でんち ${l.batteryPercent}%`
      : `${l.doorLabel} · 電池 ${l.batteryPercent}%`
  );
  setText("hm-lock-note", l.lastAccessLabel);

  const toggle = byId("hm-lock-toggle");
  if (toggle) {
    toggle.classList.remove("is-on", "is-danger");
    toggle.classList.add(l.locked ? "is-danger" : "is-on");
    toggle.textContent = l.locked
      ? plain
        ? "🔓 あける"
        : "🔓 解錠する"
      : plain
        ? "🔒 しめる"
        : "🔒 施錠する";
  }

  const log = byId("hm-lock-log");
  if (!log) return;
  if (!l.accessLog.length) {
    log.innerHTML = '<p class="hm-empty">履歴がありません</p>';
    return;
  }
  log.innerHTML = l.accessLog
    .slice(0, 8)
    .map((e) => {
      const cred = escapeHtml(e.credentialLabel);
      const holder = e.holderLabel
        ? escapeHtml(e.holderLabel)
        : plain
          ? ""
          : escapeHtml(e.holderName ?? "");
      const who = holder
        ? `${escapeHtml(e.actionLabel)} · ${holder}（${cred}）`
        : `${escapeHtml(e.actionLabel)} · ${cred}`;
      return `
      <div class="hm-log-row">
        <span>${who}</span>
        <span class="hm-log-time">${escapeHtml(e.occurredAt)}</span>
      </div>`;
    })
    .join("");
}

/* ---------- スマートインターホン ---------- */

/** ライブ枠（実映像が無い場合はモック枠を出す） */
function intercomFrameHtml(ic) {
  const tag = `<span class="hm-cam-tag">${escapeHtml(
    ic.streamKindLabel
  )}</span>`;
  const live = ic.ringing
    ? '<span class="hm-cam-live">LIVE</span>'
    : "";
  const inner = ic.hasLiveStream
    ? `<img
         class="hm-cam-img"
         src="${escapeHtml(ic.snapshotUrl || ic.streamUrl)}"
         alt="玄関カメラの映像"
         loading="lazy"
       />`
    : `<div class="hm-cam-placeholder">
         <strong>${ic.ringing ? "🔔" : "📷"}</strong>
         ${
           ic.ringing
             ? "玄関カメラに来客が映っています"
             : "カメラ映像はここに表示されます"
         }
       </div>`;
  return `
    <div class="hm-cam-frame ${ic.ringing ? "is-ringing" : ""}">
      ${inner}${tag}${live}
    </div>`;
}

/**
 * スマートインターホン
 * withUnlock=false で解錠ボタンを出さない
 */
export function renderIntercom(d, options = {}) {
  const ic = d.intercom;
  if (!ic) return;

  const card = byId("hm-intercom-card");
  if (card) card.classList.toggle("is-ringing", Boolean(ic.ringing));

  const label = byId("hm-intercom-state");
  if (label) {
    label.textContent = `${ic.stateEmoji} ${ic.stateLabel}`;
    label.classList.remove("is-ringing", "is-talking");
    if (ic.ringing) label.classList.add("is-ringing");
    else if (ic.state === "talking") label.classList.add("is-talking");
  }
  setText("hm-intercom-last", ic.lastVisitLabel);
  setText("hm-intercom-note", ic.label);

  const badge = byId("hm-intercom-badge");
  if (badge) {
    badge.className = ic.ringing
      ? "hm-badge hm-badge-danger"
      : "hm-badge hm-badge-ok";
    badge.textContent = ic.ringing ? "呼出中" : "正常";
  }

  const frame = byId("hm-intercom-frame");
  if (frame) frame.innerHTML = intercomFrameHtml(ic);

  const unlockBtn = byId("hm-intercom-unlock");
  if (unlockBtn) {
    const allowUnlock =
      ic.unlockLinkEnabled && options.withUnlock !== false;
    unlockBtn.hidden = !allowUnlock;
    unlockBtn.disabled = false;
  }

  const autoBtn = byId("hm-intercom-auto");
  if (autoBtn) autoBtn.title = ic.autoResponseMessage;
  setText("hm-intercom-auto-message", ic.autoResponseMessage);

  const list = byId("hm-intercom-visitors");
  if (!list) return;
  if (!ic.visitors.length) {
    list.innerHTML = '<p class="hm-empty">来客履歴はまだありません</p>';
    return;
  }
  list.innerHTML = ic.visitors
    .map(
      (v) => `
      <div class="hm-log-row">
        <span>
          ${escapeHtml(v.label)}
          <small class="hm-log-cred"> (${escapeHtml(
            v.handledLabel
          )})</small>
        </span>
        <span class="hm-log-time">${escapeHtml(v.occurredAt)}</span>
      </div>`
    )
    .join("");
}

/* 同じ呼出で何度もポップアップを出さない */
let lastRingKey = "";

/** 呼出発生時に画面最上部のポップアップを出す */
export function updateRingPopup(d) {
  const popup = byId("hm-ring-popup");
  const ic = d.intercom;
  if (!popup || !ic) return;

  if (!ic.ringing) {
    popup.classList.remove("is-visible");
    lastRingKey = "";
    return;
  }

  setText("hm-ring-popup-sub", `${d.displayName} · ${ic.lastVisitLabel}`);

  const unlock = byId("hm-ring-popup-unlock");
  if (unlock) unlock.hidden = !ic.unlockLinkEnabled;

  const key = `${d.siteId}|${ic.lastVisitLabel}`;
  if (key === lastRingKey) return;
  lastRingKey = key;

  popup.classList.add("is-visible");
  notifyRing(d);
}

/** PWA 通知・バイブレーション（許可済みのときだけ） */
function notifyRing(d) {
  try {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch {
    // 端末が非対応でも表示は継続
  }
  try {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      new Notification("玄関の呼び出し 🔔", {
        body: `${d.displayName} のインターホンが鳴っています`,
        tag: "tisly-home-intercom",
      });
    }
  } catch {
    // 通知不可でも画面ポップアップは出る
  }
}

/** ポップアップを閉じる */
export function hideRingPopup() {
  const popup = byId("hm-ring-popup");
  if (popup) popup.classList.remove("is-visible");
}

/* ---------- SwitchBot 連携ステータス ---------- */

/** 実機モードかモックかをバッジ表示 */
export async function renderSwitchBotBadge() {
  const el = byId("hm-switchbot-badge");
  if (!el) return;
  try {
    const res = await fetch(`${HOME_API_V1}/switchbot-status`, {
      cache: "no-store",
    });
    const data = await res.json();
    const sb = data.switchbot;
    if (!sb) return;
    el.className =
      sb.mode === "real"
        ? "hm-badge hm-badge-ok"
        : "hm-badge hm-badge-mute";
    el.textContent =
      sb.mode === "real" ? "SwitchBot 実機連携中" : "デモ（モック）動作中";
    el.title = sb.message;
  } catch {
    // 取得できない場合はバッジを触らない
  }
}

/** 現場メモ */
export function renderNotes(d) {
  const root = byId("hm-notes");
  if (!root) return;
  const notes = d.notes || [];
  root.innerHTML = notes.length
    ? notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")
    : "<li>特記事項はありません</li>";
}

/** 総合システムログ描画 */
export function renderSystemLogs(logs, options = {}) {
  const root = byId("hm-system-logs");
  if (!root) return;
  const plain = Boolean(options.plain);
  if (!logs?.length) {
    root.innerHTML = '<p class="hm-empty">動作ログはまだありません</p>';
    return;
  }
  root.innerHTML = logs
    .map((row) => {
      const line =
        row.displayLine ||
        `[${row.timeLabel || ""}] ${row.siteName}: ${row.message}`;
      return `<p class="hm-log-line">${escapeHtml(line)}</p>`;
    })
    .join("");
}

/** 風呂予約パネル描画 */
export function renderBathSchedulesPanel(data, options = {}) {
  const root = byId("hm-bath-schedule-list");
  if (!root) return;
  const schedules = data?.schedules || [];
  if (!schedules.length) {
    root.innerHTML = '<p class="hm-empty">予約はありません</p>';
    return;
  }
  root.innerHTML = schedules
    .map((s) => {
      const next = s.nextRunAt
        ? new Date(s.nextRunAt).toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo",
          })
        : "—";
      return `
        <div class="hm-schedule-row" data-schedule-id="${s.id}">
          <div>
            <strong>${escapeHtml(s.label)}</strong>
            <p class="hm-gauge-sub">次回: ${escapeHtml(next)}</p>
          </div>
          <button
            type="button"
            class="hm-btn hm-btn-sm is-off hm-schedule-cancel"
            data-schedule-id="${s.id}"
          >取消</button>
        </div>`;
    })
    .join("");
}

/** 風呂予約 UI の表示切替 */
export function setBathScheduleVisible(visible) {
  const panel = byId("hm-bath-schedule-panel");
  if (panel) panel.hidden = !visible;
}

/** ログ・予約をまとめて更新 */
export async function refreshHomeExtrasV1(siteId, dashboard, options = {}) {
  const oneshot = dashboard?.bath?.uiProfile === "oneshot_autofill";
  setBathScheduleVisible(oneshot);
  try {
    const logs = await fetchSystemLogs(siteId || null, options.logLimit || 30);
    renderSystemLogs(logs, options);
  } catch {
    renderSystemLogs([], options);
  }
  if (!oneshot || !siteId) return;
  try {
    const scheduleData = await fetchBathSchedules(siteId);
    renderBathSchedulesPanel(scheduleData, options);
  } catch {
    renderBathSchedulesPanel({ schedules: [] }, options);
  }
}

/** 風呂予約 UI イベントを束ねる */
export function bindBathScheduleUiV1(getSiteId, getActor) {
  document.querySelectorAll("[data-schedule-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.scheduleTab;
      document.querySelectorAll("[data-schedule-tab]").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.scheduleTab === key);
      });
      document.querySelectorAll("[data-schedule-pane]").forEach((pane) => {
        const active = pane.dataset.schedulePane === key;
        pane.classList.toggle("is-active", active);
        pane.hidden = !active;
      });
    });
  });

  document.querySelectorAll(".hm-schedule-delay").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const siteId = getSiteId();
      const delayMinutes = Number(btn.dataset.delay);
      if (!siteId) return;
      btn.disabled = true;
      try {
        await createBathSchedule({
          siteId,
          kind: "delay",
          delayMinutes,
          actor: getActor(),
        });
        showToast(`${delayMinutes}分後の湯はりを予約しました`);
        const data = await fetchBathSchedules(siteId);
        renderBathSchedulesPanel(data);
        const logs = await fetchSystemLogs(siteId, 30);
        renderSystemLogs(logs);
      } catch (err) {
        showToast(err.message || "予約に失敗しました");
      } finally {
        btn.disabled = false;
      }
    });
  });

  const dailyBtn = byId("hm-bath-daily-submit");
  if (dailyBtn) {
    dailyBtn.addEventListener("click", async () => {
      const siteId = getSiteId();
      const timeInput = byId("hm-bath-daily-time");
      if (!siteId || !timeInput?.value) return;
      dailyBtn.disabled = true;
      try {
        await createBathSchedule({
          siteId,
          kind: "daily",
          dailyTime: timeInput.value,
          actor: getActor(),
        });
        showToast(`毎日 ${timeInput.value} の湯はりを予約しました`);
        renderBathSchedulesPanel(await fetchBathSchedules(siteId));
        renderSystemLogs(await fetchSystemLogs(siteId, 30));
      } catch (err) {
        showToast(err.message || "予約に失敗しました");
      } finally {
        dailyBtn.disabled = false;
      }
    });
  }

  const onceBtn = byId("hm-bath-once-submit");
  if (onceBtn) {
    onceBtn.addEventListener("click", async () => {
      const siteId = getSiteId();
      const timeInput = byId("hm-bath-once-time");
      if (!siteId || !timeInput?.value) return;
      onceBtn.disabled = true;
      try {
        const runAt = new Date(timeInput.value).toISOString();
        await createBathSchedule({
          siteId,
          kind: "once",
          runAt,
          actor: getActor(),
        });
        showToast("指定日時の湯はりを予約しました");
        renderBathSchedulesPanel(await fetchBathSchedules(siteId));
        renderSystemLogs(await fetchSystemLogs(siteId, 30));
      } catch (err) {
        showToast(err.message || "予約に失敗しました");
      } finally {
        onceBtn.disabled = false;
      }
    });
  }

  document.addEventListener("click", async (event) => {
    const btn = event.target.closest(".hm-schedule-cancel");
    if (!btn) return;
    const siteId = getSiteId();
    const scheduleId = Number(btn.dataset.scheduleId);
    if (!siteId || !Number.isFinite(scheduleId)) return;
    btn.disabled = true;
    try {
      await cancelBathSchedule(siteId, scheduleId, getActor());
      showToast("予約をキャンセルしました");
      renderBathSchedulesPanel(await fetchBathSchedules(siteId));
      renderSystemLogs(await fetchSystemLogs(siteId, 30));
    } catch (err) {
      showToast(err.message || "キャンセルに失敗しました");
    } finally {
      btn.disabled = false;
    }
  });
}

/** URL の siteId を読む */
export function readSiteIdFromUrl() {
  try {
    return new URLSearchParams(location.search).get("siteId") || "";
  } catch {
    return "";
  }
}

/** URL の siteId を履歴を汚さず差し替える */
export function replaceSiteIdInUrl(siteId) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("siteId", siteId);
    history.replaceState(null, "", url.toString());
  } catch {
    // 失敗しても表示は継続
  }
}

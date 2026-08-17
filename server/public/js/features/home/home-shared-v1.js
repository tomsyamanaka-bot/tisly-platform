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
  setText("hm-bath-temp", Number(b.setTempC).toFixed(0));
  setText(
    "hm-bath-state",
    `${b.fillStateLabel}${b.reheating ? " · 追いだき中" : ""}` +
      `${b.keepWarm ? " · 保温ON" : ""}`
  );
  setText(
    "hm-bath-current",
    plain
      ? `いまの湯温 ${Number(b.currentTempC).toFixed(1)} ℃`
      : `浴槽 ${Number(b.currentTempC).toFixed(1)} ℃`
  );
  setText(
    "hm-bath-percent",
    plain
      ? `たまり具合 ${b.fillPercent}%`
      : `湯はり ${b.fillPercent}%`
  );
  setText(
    "hm-bath-note",
    plain ? b.fillStateLabel : `${d.hotWaterSpec} · ${b.linkStateLabel}`
  );
  const linkEl = byId("hm-bath-link");
  if (linkEl) {
    if (plain) {
      linkEl.hidden = true;
      linkEl.textContent = "";
    } else {
      linkEl.hidden = false;
      linkEl.textContent = `${b.jemaTerminal} / RP2350 ${b.relayPort} — ${b.linkStateLabel}`;
    }
  }

  const bar = byId("hm-bath-bar");
  if (bar) bar.style.width = `${Math.min(100, b.fillPercent)}%`;

  toggleStateBtn("hm-bath-autofill", b.autoFill, "自動お湯はり");
  toggleStateBtn("hm-bath-reheat", b.reheating, "追いだき");
  toggleStateBtn("hm-bath-keepwarm", b.keepWarm, "ふろ保温");
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

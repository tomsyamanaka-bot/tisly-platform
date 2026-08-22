/**
 * TiSLY HOME — 機器タイル・グリッド v2
 * 2色ベース（白 × スレートグレー）· ミニマル · 余白重視
 */

import { byId, escapeHtml } from "./home-shared-v1.js";

export const HOME_TILE_ORDER_V1 = [
  "ct",
  "lock",
  "intercom",
  "bath",
  "aircon",
];

const TILE_META_V1 = {
  ct: {
    icon: "⚡",
    name: "分電盤CT",
    plainName: "電気",
    detailTitle: "分電盤CT の詳細",
  },
  lock: {
    icon: "🔐",
    name: "スマートロック",
    plainName: "玄関のかぎ",
    detailTitle: "玄関のかぎの詳細",
  },
  intercom: {
    icon: "🔔",
    name: "インターホン",
    plainName: "インターホン",
    detailTitle: "インターホンの詳細",
  },
  bath: {
    icon: "🛁",
    name: "風呂",
    plainName: "お風呂",
    detailTitle: "お風呂の詳細",
  },
  aircon: {
    icon: "❄️",
    name: "エアコン",
    plainName: "エアコン",
    detailTitle: "エアコンの詳細",
  },
};

function tileName(key, plain) {
  const meta = TILE_META_V1[key];
  if (!meta) return key;
  return plain ? meta.plainName : meta.name;
}

function fixed1(value) {
  return Number(value ?? 0).toFixed(1);
}

function ctTileV1(d, plain) {
  const ct = d.ct;
  const overload = ct.level === "alert" || ct.level === "warning";
  const tone = overload ? "alert" : ct.level === "normal" ? "on" : "idle";
  return {
    key: "ct",
    detail: "ct",
    icon: TILE_META_V1.ct.icon,
    name: tileName("ct", plain),
    state: `${fixed1(ct.mainCurrentA)} A`,
    stateAlert: overload,
    tone,
    badge: {
      label: ct.peakCutActive ? "ピーク" : ct.level === "normal" ? "正常" : "注意",
      cls: overload ? "is-danger" : "is-ok",
    },
  };
}

function lockTileV1(d, plain) {
  const l = d.lock;
  const locked = l.locked;
  return {
    key: "lock",
    detail: "lock",
    icon: TILE_META_V1.lock.icon,
    name: tileName("lock", plain),
    state: locked ? "施錠中" : "解錠中",
    stateAlert: !locked,
    tone: locked ? "on" : "alert",
    action: {
      label: locked ? "解錠" : "施錠",
      target: "lock",
      action: locked ? "unlock" : "lock",
      style: locked ? "is-danger" : "is-on",
      aria: locked ? "玄関を解錠する" : "玄関を施錠する",
    },
  };
}

function intercomTileV1(d, plain) {
  const ic = d.intercom;
  if (!ic) return null;
  const ringing = ic.ringing;
  return {
    key: "intercom",
    detail: "intercom",
    icon: TILE_META_V1.intercom.icon,
    name: tileName("intercom", plain),
    state: ringing ? "呼出中" : "待機中",
    stateAlert: ringing,
    tone: ringing ? "alert" : "idle",
    action: ringing
      ? {
          label: plain ? "話す" : "応答",
          target: "intercom",
          action: "answer",
          style: "is-danger",
          aria: "インターホンに応答する",
        }
      : {
          label: plain ? "置き配" : "自動",
          target: "intercom",
          action: "auto_response",
          style: "is-neutral",
          aria: "自動応答メッセージを流す",
        },
  };
}

function bathTileV1(d, plain) {
  const b = d.bath;
  const oneshot = b.uiProfile === "oneshot_autofill";
  if (oneshot) {
    const done = Boolean(b.lastPulseMessage) || b.fillState === "done";
    return {
      key: "bath",
      detail: "bath",
      icon: TILE_META_V1.bath.icon,
      name: tileName("bath", plain),
      state: done ? "湯はり指令完了" : "待機中",
      stateAlert: false,
      tone: done ? "on" : "idle",
      action: {
        label: "♨️ お湯はり",
        target: "bath",
        action: "auto_fill",
        value: "true",
        style: "is-oneshot",
        aria: "お湯はり自動ボタンを押す",
      },
    };
  }
  const running = b.fillState === "filling" || b.reheating || b.keepWarm;
  return {
    key: "bath",
    detail: "bath",
    icon: TILE_META_V1.bath.icon,
    name: tileName("bath", plain),
    state: running ? "湯はり中" : "停止中",
    stateAlert: false,
    tone: running ? "on" : "idle",
    action: {
      label: b.autoFill ? "停止" : "自動",
      target: "bath",
      action: "auto_fill",
      value: b.autoFill ? "false" : "true",
      style: b.autoFill ? "is-on" : "is-neutral",
      aria: b.autoFill ? "自動お湯はりを止める" : "自動お湯はりを始める",
    },
  };
}

function airconTilesV1(d) {
  return (d.aircons || []).map((ac) => ({
    key: `aircon:${ac.deviceKey}`,
    detail: "aircon",
    icon: TILE_META_V1.aircon.icon,
    name: ac.label.replace(/\s*エアコン\s*/g, "").trim() || ac.label,
    state: ac.power
      ? `${ac.modeLabel} ${Math.round(ac.setTempC)}℃`
      : "停止中",
    stateAlert: false,
    tone: ac.power ? "on" : "idle",
    action: {
      label: ac.power ? "OFF" : "ON",
      target: "aircon",
      action: "power",
      deviceKey: ac.deviceKey,
      value: ac.power ? "false" : "true",
      style: ac.power ? "is-on" : "is-neutral",
      aria: `${ac.label} の電源を切り替える`,
    },
  }));
}

export function buildHomeTilesV1(d, options = {}) {
  if (!d) return [];
  const plain = Boolean(options.plain);
  const tiles = [
    ctTileV1(d, plain),
    lockTileV1(d, plain),
    intercomTileV1(d, plain),
    bathTileV1(d, plain),
    ...airconTilesV1(d),
  ];
  return tiles.filter(Boolean);
}

function actionHtml(action) {
  if (!action) return "";
  const device = action.deviceKey
    ? ` data-device="${escapeHtml(action.deviceKey)}"`
    : "";
  const value =
    action.value === undefined
      ? ""
      : ` data-value="${escapeHtml(action.value)}"`;
  return `<button
      type="button"
      class="hm-tile-action ${escapeHtml(action.style || "")}"
      data-target="${escapeHtml(action.target)}"
      data-action="${escapeHtml(action.action)}"${device}${value}
      aria-label="${escapeHtml(action.aria || action.label)}"
    >${escapeHtml(action.label)}</button>`;
}

function badgeHtml(badge) {
  if (!badge) return "";
  return `<span class="hm-tile-badge ${escapeHtml(
    badge.cls || "is-ok"
  )}">${escapeHtml(badge.label)}</span>`;
}

function tileHtml(tile) {
  const stateCls = tile.stateAlert ? " is-alert-text" : "";
  return `
    <article
      class="hm-tile is-${escapeHtml(tile.tone)}"
      data-tile="${escapeHtml(tile.key)}"
    >
      <div class="hm-tile-top">
        <span class="hm-tile-icon" aria-hidden="true">${escapeHtml(
          tile.icon
        )}</span>
        ${tile.action ? actionHtml(tile.action) : badgeHtml(tile.badge)}
      </div>
      <button
        type="button"
        class="hm-tile-open"
        data-detail-open="${escapeHtml(tile.detail)}"
        aria-expanded="false"
      >
        <span class="hm-tile-name">${escapeHtml(tile.name)}</span>
        <span class="hm-tile-state${stateCls}">${escapeHtml(tile.state)}</span>
      </button>
    </article>`;
}

function updateTileEl(el, tile) {
  el.className = `hm-tile is-${tile.tone}`;
  const setText = (selector, text) => {
    const target = el.querySelector(selector);
    if (target && target.textContent !== text) {
      target.textContent = text;
    }
  };
  setText(".hm-tile-name", tile.name);
  setText(".hm-tile-state", tile.state);

  const stateEl = el.querySelector(".hm-tile-state");
  if (stateEl) {
    stateEl.classList.toggle("is-alert-text", Boolean(tile.stateAlert));
  }

  const btn = el.querySelector(".hm-tile-action");
  if (btn && tile.action) {
    btn.className = `hm-tile-action ${tile.action.style || ""}`;
    btn.textContent = tile.action.label;
    btn.dataset.action = tile.action.action;
    if (tile.action.value === undefined) delete btn.dataset.value;
    else btn.dataset.value = String(tile.action.value);
    btn.setAttribute(
      "aria-label",
      tile.action.aria || tile.action.label
    );
  }

  const badge = el.querySelector(".hm-tile-badge");
  if (badge && tile.badge) {
    badge.className = `hm-tile-badge ${tile.badge.cls || "is-ok"}`;
    badge.textContent = tile.badge.label;
  }
}

let renderedTileKeys = "";

export function renderHomeTilesV1(d, options = {}) {
  const root = byId("hm-tile-grid");
  if (!root) return;
  const tiles = buildHomeTilesV1(d, options);
  if (!tiles.length) {
    renderedTileKeys = "";
    root.innerHTML = '<p class="hm-empty">機器がありません</p>';
    return;
  }

  const key = tiles.map((t) => t.key).join("|");
  if (key === renderedTileKeys) {
    for (const tile of tiles) {
      const el = root.querySelector(
        `[data-tile="${CSS.escape(tile.key)}"]`
      );
      if (el) updateTileEl(el, tile);
    }
    return;
  }
  renderedTileKeys = key;
  root.innerHTML = tiles.map(tileHtml).join("");
}

function panels() {
  return Array.from(document.querySelectorAll(".hm-detail-panel"));
}

function syncExpandedState() {
  const openKeys = new Set(
    panels()
      .filter((p) => !p.hidden)
      .map((p) => p.dataset.detail)
  );
  for (const btn of document.querySelectorAll("[data-detail-open]")) {
    btn.setAttribute(
      "aria-expanded",
      openKeys.has(btn.dataset.detailOpen) ? "true" : "false"
    );
  }
}

export function closeHomeDetailV1(detailKey) {
  for (const panel of panels()) {
    if (!detailKey || panel.dataset.detail === detailKey) {
      panel.hidden = true;
    }
  }
  syncExpandedState();
}

export function openHomeDetailV1(detailKey) {
  const target = panels().find((p) => p.dataset.detail === detailKey);
  if (!target) return;
  const wasOpen = !target.hidden;
  for (const panel of panels()) panel.hidden = true;
  target.hidden = wasOpen;
  syncExpandedState();
  if (!target.hidden) {
    try {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      target.scrollIntoView();
    }
  }
}

export function bindHomeTileDetailsV1() {
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-detail-open]");
    if (opener) {
      openHomeDetailV1(opener.dataset.detailOpen);
      return;
    }
    const closer = event.target.closest("[data-detail-close]");
    if (closer) closeHomeDetailV1(closer.dataset.detailClose);
  });
  syncExpandedState();
}

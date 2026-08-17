/**
 * TiSLY HOME — 機器タイル・グリッド v1
 *
 * SwitchBot 風の 2列（可変）タイルを描画する。
 * 並び順は工事屋目線の優先度:
 *   分電盤CT → スマートロック → インターホン → 風呂 → エアコン
 *
 * タイル右上のボタンは既存の /api/home/v1/control へ
 * data-target / data-action で流すため、
 * home-operator-v1.js / home-customer-v1.js の
 * 既存デリゲーションがそのまま使える。
 *
 * 詳細カード（従来の縦長カード）は
 * .hm-detail-panel として折りたたみ、タイルから開く。
 */

import { byId, escapeHtml } from "./home-shared-v1.js";

/** タイルの表示順（工事屋目線） */
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
    name: "分電盤CT（主幹）",
    plainName: "電気の使用量",
    detailTitle: "分電盤CT の詳細",
  },
  lock: {
    icon: "🔐",
    name: "玄関スマートロック",
    plainName: "玄関のかぎ",
    detailTitle: "玄関のかぎの詳細",
  },
  intercom: {
    icon: "🔔",
    name: "スマートインターホン",
    plainName: "玄関のインターホン",
    detailTitle: "インターホンの詳細",
  },
  bath: {
    icon: "🛁",
    name: "風呂 自動",
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

/* ---------- 各機器のタイル定義 ---------- */

/** 1. 分電盤CT — 「56.8A / 10.0kW」 */
function ctTileV1(d, plain) {
  const ct = d.ct;
  const tone =
    ct.level === "alert"
      ? "alert"
      : ct.level === "warning"
      ? "warn"
      : "on";
  const badgeCls =
    ct.level === "alert"
      ? "is-danger"
      : ct.level === "warning"
      ? "is-warn"
      : "is-ok";
  const sub = plain
    ? `${ct.levelLabel} · 余裕 ${Math.max(
        0,
        100 - Math.round(ct.loadPercent)
      )}%`
    : `主幹 ${ct.mainCapacityA}A · 負荷 ${ct.loadPercent}% · ${ct.levelLabel}`;
  return {
    key: "ct",
    detail: "ct",
    icon: TILE_META_V1.ct.icon,
    name: tileName("ct", plain),
    state: `${fixed1(ct.mainCurrentA)}A / ${fixed1(ct.powerKw)}kW`,
    sub,
    tone,
    badge: {
      label: ct.peakCutActive ? "ピークカット" : ct.levelLabel,
      cls: ct.peakCutActive ? "is-warn" : badgeCls,
    },
  };
}

/** 2. 玄関スマートロック — 「施錠済み」「解錠中」 */
function lockTileV1(d, plain) {
  const l = d.lock;
  return {
    key: "lock",
    detail: "lock",
    icon: TILE_META_V1.lock.icon,
    name: tileName("lock", plain),
    state: l.locked ? "施錠済み" : "解錠中",
    sub: plain
      ? `${l.doorLabel} · でんち ${l.batteryPercent}%`
      : `${l.doorLabel} · 電池 ${l.batteryPercent}%`,
    tone: l.locked ? "on" : "alert",
    action: {
      label: l.locked ? "🔓 解錠" : "🔒 施錠",
      target: "lock",
      action: l.locked ? "unlock" : "lock",
      style: l.locked ? "is-danger" : "is-on",
      aria: l.locked ? "玄関を解錠する" : "玄関を施錠する",
    },
  };
}

/** 3. スマートインターホン — 「待機中」「呼出あり！」 */
function intercomTileV1(d, plain) {
  const ic = d.intercom;
  if (!ic) return null;
  const tone = ic.ringing
    ? "alert"
    : ic.state === "talking"
    ? "on"
    : "idle";
  const action = ic.ringing
    ? {
        label: plain ? "話す" : "応答",
        target: "intercom",
        action: "answer",
        style: "is-danger",
        aria: "インターホンに応答する",
      }
    : {
        label: plain ? "置き配" : "自動応答",
        target: "intercom",
        action: "auto_response",
        style: "is-off",
        aria: "自動応答メッセージを流す",
      };
  return {
    key: "intercom",
    detail: "intercom",
    icon: TILE_META_V1.intercom.icon,
    name: tileName("intercom", plain),
    state: ic.ringing ? "呼出あり！" : ic.stateLabel,
    sub: ic.lastVisitLabel,
    tone,
    action,
  };
}

/** 4. 風呂 自動 — 「自動お湯はり中」「追いだきON」 */
function bathTileV1(d, plain) {
  const b = d.bath;
  let state = "停止中";
  if (b.fillState === "filling") state = "自動お湯はり中";
  else if (b.reheating) state = "追いだきON";
  else if (b.keepWarm) state = "ふろ保温中";
  else if (b.fillState === "done") state = "湯はり完了";

  const running =
    b.fillState === "filling" || b.reheating || b.keepWarm;
  return {
    key: "bath",
    detail: "bath",
    icon: TILE_META_V1.bath.icon,
    name: tileName("bath", plain),
    state,
    sub: plain
      ? `おゆ ${Math.round(b.setTempC)}℃ · よくそう ${fixed1(
          b.currentTempC
        )}℃`
      : `給湯 ${Math.round(b.setTempC)}℃ · 浴槽 ${fixed1(
          b.currentTempC
        )}℃ · ${b.fillPercent}%`,
    tone: running ? "on" : "idle",
    action: {
      label: `風呂 自動 ${b.autoFill ? "ON" : "OFF"}`,
      target: "bath",
      action: "auto_fill",
      value: b.autoFill ? "false" : "true",
      style: b.autoFill ? "is-on" : "is-off",
      aria: b.autoFill
        ? "自動お湯はりを止める"
        : "自動お湯はりを始める",
    },
  };
}

/** 5. エアコン — 「冷房 26℃」「停止中」（台数ぶん並べる） */
function airconTilesV1(d) {
  return (d.aircons || []).map((ac) => ({
    key: `aircon:${ac.deviceKey}`,
    detail: "aircon",
    icon: TILE_META_V1.aircon.icon,
    name: ac.label,
    state: ac.power
      ? `${ac.modeLabel} ${Math.round(ac.setTempC)}℃`
      : "停止中",
    sub: `室温 ${fixed1(ac.roomTempC)}℃ · 風量${ac.fanLabel}${
      ac.peakSaveActive ? " · セーブ中" : ""
    }`,
    tone: ac.power ? "on" : "idle",
    action: {
      label: ac.power ? "電源 ON" : "電源 OFF",
      target: "aircon",
      action: "power",
      deviceKey: ac.deviceKey,
      value: ac.power ? "false" : "true",
      style: ac.power ? "is-on" : "is-off",
      aria: `${ac.label} の電源を切り替える`,
    },
  }));
}

/**
 * タイル一覧を組み立てる
 * options.plain=true でお客様向けのやさしい表現にする
 */
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

/* ---------- 描画 ---------- */

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
        <span class="hm-tile-state">${escapeHtml(tile.state)}</span>
        <span class="hm-tile-sub">${escapeHtml(tile.sub)}</span>
        <span class="hm-tile-more">詳しく操作する ›</span>
      </button>
    </article>`;
}

/** 台数・並びが変わっていなければ DOM を作り直さない */
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
  setText(".hm-tile-sub", tile.sub);

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

/** タイル・グリッドを描画（ポーリング時は差分更新） */
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
    // 構成が同じならテキストとクラスだけ更新（チラつき防止）
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

/* ---------- 詳細パネルの開閉 ---------- */

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

/** 指定機器の詳細パネルを閉じる */
export function closeHomeDetailV1(detailKey) {
  for (const panel of panels()) {
    if (!detailKey || panel.dataset.detail === detailKey) {
      panel.hidden = true;
    }
  }
  syncExpandedState();
}

/** 指定機器の詳細パネルだけを開く（同じタイルの再タップで閉じる） */
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

/** タイル ↔ 詳細パネルの開閉をバインド */
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

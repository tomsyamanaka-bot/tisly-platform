/**
 * ガス事業者向け
 * ボンベ残量 · 検針 · 要配送ソート表示
 */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kindLabel(kind) {
  if (kind === "detached") return "戸建て";
  if (kind === "apartment") return "アパート";
  if (kind === "shop") return "店舗";
  return kind;
}

async function loadOperator() {
  const res = await fetch("/api/gas-monitor/v1/operator", {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "読込失敗");
  return data.dashboard;
}

function renderSummary(d) {
  document.getElementById("gm-sum-total").textContent =
    String(d.totalProperties);
  document.getElementById("gm-sum-delivery").textContent =
    String(d.deliveryAlertCount);
  document.getElementById("gm-sum-emergency").textContent =
    String(d.emergencyCount);
}

function cylinderBars(cylinders) {
  return (cylinders || [])
    .map((c) => {
      const low = c.percent <= 20;
      const active = c.active ? "使用中" : "待機";
      return `
        <div class="gm-cyl-row">
          <div class="gm-cyl-label">
            <span>${c.index}本目（${active}）</span>
            <span>${c.remainingKg.toFixed(1)} / ${c.capacityKg} kg（${c.percent}%）</span>
          </div>
          <div class="gm-bar${low ? " is-low" : ""}" aria-hidden="true">
            <span style="width:${Math.max(2, c.percent)}%"></span>
          </div>
        </div>`;
    })
    .join("");
}

function renderList(d) {
  const root = document.getElementById("gm-prop-list");
  const rows = d.properties || [];
  if (!rows.length) {
    root.innerHTML = `<p class="gm-empty">登録物件がありません</p>`;
    return;
  }
  root.innerHTML = rows
    .map((p) => {
      let badge = `<span class="gm-badge gm-badge-ok">正常</span>`;
      let cls = "gm-prop-card";
      if (p.emergencyShutoff) {
        badge = `<span class="gm-badge gm-badge-emergency">緊急遮断</span>`;
        cls += " is-emergency";
      } else if (p.needsDelivery) {
        badge = `<span class="gm-badge gm-badge-delivery">要配送</span>`;
        cls += " is-delivery";
      }
      const switchNote = p.autoSwitchDetected
        ? `<p class="gm-pulse">⚠ 自動切替を検知</p>`
        : "";
      return `
        <article class="${cls}">
          <div class="gm-prop-head">
            <div>
              <h3 class="gm-prop-name">${escapeHtml(p.displayName)}</h3>
              <p class="gm-prop-addr">
                ${escapeHtml(p.addressLabel)} · ${kindLabel(p.kind)}
                · ${escapeHtml(p.countryCode)}/${escapeHtml(p.currency)}
              </p>
            </div>
            ${badge}
          </div>
          <p class="gm-pulse">
            積算パルス: ${Number(p.meterPulseTotal).toLocaleString("ja-JP")}
            · 今日 ${Number(p.todayUsageM3).toFixed(2)} m³
          </p>
          ${switchNote}
          <div class="gm-cyl">${cylinderBars(p.cylinders)}</div>
        </article>`;
    })
    .join("");
}

async function refresh() {
  const d = await loadOperator();
  renderSummary(d);
  renderList(d);
}

document.addEventListener("DOMContentLoaded", () => {
  const back = document.getElementById("gm-back-link");
  if (back) back.href = "/app";
  refresh().catch((err) => {
    console.error(err);
    const root = document.getElementById("gm-prop-list");
    if (root) {
      root.innerHTML =
        `<p class="gm-empty">読み込みに失敗しました</p>`;
    }
  });
});

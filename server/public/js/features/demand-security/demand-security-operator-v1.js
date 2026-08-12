/**
 * 社内向け
 * デマンド · リレー遠隔 · 防犯一覧
 */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kindLabel(kind) {
  if (kind === "home") return "戸建て";
  if (kind === "shop") return "店舗";
  if (kind === "factory") return "工場";
  return kind;
}

function doorLabel(state) {
  if (state === "locked") return "施錠";
  if (state === "unlocked") return "解錠";
  return "開";
}

function motionLabel(state) {
  return state === "detected" ? "人感あり" : "人感なし";
}

async function loadOperator() {
  const res = await fetch("/api/demand-security/v1/operator", {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "読込失敗");
  return data.dashboard;
}

async function toggleRelay(siteId, relayId, nextOn) {
  const res = await fetch("/api/demand-security/v1/relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId, relayId, on: nextOn }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "操作失敗");
  return data.dashboard;
}

function renderSummary(d) {
  document.getElementById("ds-sum-total").textContent =
    String(d.totalSites);
  document.getElementById("ds-sum-peak").textContent =
    String(d.peakCutCount);
  document.getElementById("ds-sum-sec").textContent =
    String(d.securityAlertCount);
}

function relayRows(site) {
  return (site.relays || [])
    .map((r) => {
      const onCls = r.on ? "is-on" : "is-off";
      const label = r.on ? "ON" : "OFF";
      const next = r.on ? "false" : "true";
      return `
        <div class="ds-relay-row">
          <div class="ds-relay-meta">
            ${escapeHtml(r.label)}
            <small>${r.voltage}V · ピーク対象:${r.peakCutEnabled ? "はい" : "いいえ"}</small>
          </div>
          <button
            type="button"
            class="ds-relay-btn ${onCls}"
            data-site="${escapeHtml(site.siteId)}"
            data-relay="${escapeHtml(r.id)}"
            data-next="${next}"
          >${label}</button>
        </div>`;
    })
    .join("");
}

function renderList(d) {
  const root = document.getElementById("ds-site-list");
  const rows = d.sites || [];
  if (!rows.length) {
    root.innerHTML = `<p class="ds-empty">登録物件がありません</p>`;
    return;
  }
  root.innerHTML = rows
    .map((s) => {
      let badge = `<span class="ds-badge ds-badge-ok">正常</span>`;
      let cls = "ds-site-card";
      if (s.securityAttention) {
        badge = `<span class="ds-badge ds-badge-sec">防犯要確認</span>`;
        cls += " is-security";
      } else if (s.peakCutActive) {
        badge = `<span class="ds-badge ds-badge-peak">ピークカット</span>`;
        cls += " is-peak";
      }
      return `
        <article class="${cls}">
          <div class="ds-site-head">
            <div>
              <h3 class="ds-site-name">${escapeHtml(s.displayName)}</h3>
              <p class="ds-site-addr">
                ${escapeHtml(s.addressLabel)} · ${kindLabel(s.kind)}
                · ${escapeHtml(s.countryCode)}/${escapeHtml(s.currency)}
              </p>
            </div>
            ${badge}
          </div>
          <p class="ds-metrics">
            主幹 ${Number(s.mainCurrentA).toFixed(1)} A
            · デマンド ${Number(s.currentDemandKw).toFixed(1)} /
            ${Number(s.contractDemandKw).toFixed(0)} kW
            （${Number(s.demandUsagePercent).toFixed(0)}%）
          </p>
          <p class="ds-metrics">
            扉:${doorLabel(s.doorState)}
            · ${motionLabel(s.motionState)}
            · テナント ${escapeHtml(s.tenantId)}
          </p>
          <div class="ds-relay-list">${relayRows(s)}</div>
        </article>`;
    })
    .join("");

  root.querySelectorAll(".ds-relay-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const siteId = btn.getAttribute("data-site");
      const relayId = btn.getAttribute("data-relay");
      const nextOn = btn.getAttribute("data-next") === "true";
      btn.disabled = true;
      try {
        const dash = await toggleRelay(siteId, relayId, nextOn);
        renderSummary(dash);
        renderList(dash);
      } catch (err) {
        console.error(err);
        alert("操作に失敗しました");
        btn.disabled = false;
      }
    });
  });
}

async function refresh() {
  const d = await loadOperator();
  renderSummary(d);
  renderList(d);
}

document.addEventListener("DOMContentLoaded", () => {
  const back = document.getElementById("ds-back-link");
  if (back) back.href = "/app";
  refresh().catch((err) => {
    console.error(err);
    const root = document.getElementById("ds-site-list");
    if (root) {
      root.innerHTML =
        `<p class="ds-empty">読み込みに失敗しました</p>`;
    }
  });
});

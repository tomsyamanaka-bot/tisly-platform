import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";
const projectId = window.location.pathname.split("/project/")[1]?.split("/")[0] ?? "";

const PIN_COLORS = { ONLINE: "#3fb950", WARNING: "#d29922", OFFLINE: "#f85149" };

async function api(path, opts = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

function statusClass(s) {
  if (s === "ONLINE") return "status-online";
  if (s === "WARNING") return "status-warning";
  return "status-offline";
}

function renderFloorStack(stack) {
  const el = document.getElementById("dash-floor-stack");
  if (!stack?.layers?.length) {
    el.innerHTML = "<p>フロアデータがありません</p>";
    return;
  }
  el.innerHTML = stack.layers
    .map((layer) => {
      const pins = layer.pins || [];
      const pinHtml = pins
        .map(
          (p) =>
            `<span class="floor-pin" style="left:${p.posX}%;top:${p.posY}%;background:${PIN_COLORS[p.status] || PIN_COLORS.OFFLINE}" title="${p.label || p.pinType} (${p.status})">${(p.pinType || "?").slice(0, 2)}</span>`
        )
        .join("");
      return `<div class="floor-layer${layer.scrollTarget ? " anomaly" : ""}" id="floor-${layer.tier}" data-tier="${layer.tier}">
        <h3>${layer.displayName} ${layer.anomalyCount ? `<span class="badge err">${layer.anomalyCount} 異常</span>` : ""}</h3>
        <div class="floor-canvas">${pinHtml || "<p style='padding:1rem;color:#8b949e'>ピンなし</p>"}</div>
      </div>`;
    })
    .join("");
  if (stack.firstAnomalyTier) {
    const target = document.getElementById(`floor-${stack.firstAnomalyTier}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function renderDevices(devices) {
  const el = document.getElementById("dash-devices");
  if (!devices?.length) {
    el.innerHTML = "<p>設備データなし</p>";
    return;
  }
  el.innerHTML = `<table class="device-table"><thead><tr><th>名称</th><th>種別</th><th>階</th><th>状態</th><th>最終</th></tr></thead><tbody>
    ${devices
      .map(
        (d) =>
          `<tr><td>${d.name}</td><td>${d.device_type}</td><td>${d.floor || "—"}</td>
          <td class="${statusClass(d.status)}">${d.status}</td><td>${d.last_seen || "—"}</td></tr>`
      )
      .join("")}
  </tbody></table>`;
}

function renderNotifications(notifications) {
  const el = document.getElementById("dash-notifications");
  const unacked = (notifications || []).filter((n) => !n.acknowledged);
  el.innerHTML = `<h2>通知センター (${unacked.length} 未確認)</h2>
    ${(notifications || [])
      .map(
        (n) =>
          `<div class="notif-item">
            <div><strong>${n.title}</strong><br><small>${n.body}</small></div>
            ${!n.acknowledged ? `<button type="button" data-ack="${n.id}">確認</button>` : "<small>確認済</small>"}
          </div>`
      )
      .join("") || "<p>通知なし</p>"}`;
  el.querySelectorAll("[data-ack]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/toms/projects/${projectId}/notifications/${btn.dataset.ack}/ack`, {
        method: "POST",
      });
      loadDashboard();
    });
  });
}

function renderDrawingDiff(diff) {
  const el = document.getElementById("dash-drawing-diff");
  if (!diff) {
    el.innerHTML = "";
    return;
  }
  const tabs = ["survey", "construction", "as_built"];
  const labels = { survey: "現調", construction: "施工", as_built: "完成" };
  el.innerHTML = `
    <div class="diff-tabs">${tabs.map((t, i) => `<button type="button" data-tab="${t}" class="${i === 0 ? "active" : ""}">${labels[t]}</button>`).join("")}</div>
    <div id="diff-list"></div>
    <h3 style="margin-top:1rem">差分一覧</h3>
    <p><strong>追加</strong>: ${(diff.added || []).map((d) => d.label).join(", ") || "—"}</p>
    <p><strong>削除</strong>: ${(diff.removed || []).map((d) => d.label).join(", ") || "—"}</p>
    <p><strong>位置変更</strong>: ${(diff.moved || []).map((m) => `${m.from.label}→${m.to.label}`).join(", ") || "—"}</p>`;
  const listEl = document.getElementById("diff-list");
  function showTab(t) {
    el.querySelectorAll(".diff-tabs button").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === t);
    });
    const items = diff[t] || [];
    listEl.innerHTML = items.length
      ? `<ul>${items.map((d) => `<li>${d.label} (${d.assetType})</li>`).join("")}</ul>`
      : "<p>機器なし</p>";
  }
  el.querySelectorAll(".diff-tabs button").forEach((b) => {
    b.addEventListener("click", () => showTab(b.dataset.tab));
  });
  showTab("survey");
}

function renderMaintenance(cases) {
  const el = document.getElementById("dash-maintenance");
  el.innerHTML = `${(cases || [])
    .map(
      (c) =>
        `<div class="notif-item"><div><strong>${c.scheduledDate}</strong> ${c.content}<br>
        <small>${c.assignee || "—"} · ${c.status} · 設備: ${(c.targetDevices || []).join(", ") || "—"}</small></div></div>`
    )
    .join("") || "<p>保守案件なし</p>"}`;
}

async function loadDashboard() {
  if (!projectId) return;
  const res = await api(`/api/toms/projects/${projectId}/dashboard`);
  if (!res.ok) {
    document.getElementById("dash-title").textContent = "案件が見つかりません";
    return;
  }
  const data = await res.json();
  const p = data.project;
  document.getElementById("dash-title").textContent = `${p.projectNo} ${p.title}`;
  document.getElementById("dash-state").textContent = `TOMS: ${data.tomsState} / ${p.status}`;
  document.getElementById("dash-state").className =
    data.proRemote?.status === "ONLINE" ? "badge" : "badge warn";

  document.getElementById("dash-customer").innerHTML = `
    <h2>顧客・現場</h2>
    <p>${p.customerName}<br>${p.address}<br>${p.phone}</p>
    <p>GPS: <a href="https://maps.google.com/?q=${data.gps?.lat},${data.gps?.lng}" target="_blank" rel="noopener">${data.gps?.lat ?? "—"}, ${data.gps?.lng ?? "—"}</a></p>`;

  document.getElementById("dash-finance").innerHTML = `
    <h2>見積・請求・入金</h2>
    <p>見積: ${data.estimate?.estimateNo ?? "—"}</p>
    <p>請求: ${data.invoice?.invoiceNo ?? "—"}</p>
    <p>入金: ${(data.payments || []).map((pay) => `¥${pay.amount} (${pay.date})`).join("<br>") || "—"}</p>
    <p>施工履歴: ${(data.constructionHistory || []).length} 件</p>`;

  document.getElementById("dash-pro-remote").innerHTML = `
    <h2>PRO Remote</h2>
    <p>状態: <span class="${statusClass(data.proRemote?.status)}">${data.proRemote?.status}</span></p>
    <p><a href="${data.links?.proRemote}">PRO Remote を開く</a></p>`;

  renderNotifications(data.notifications);
  renderFloorStack(data.floorStack);
  renderDevices(data.liveDevices);
  renderDrawingDiff(data.drawingDiff);
  renderMaintenance(data.maintenance);

  const timeline = [...(data.timeline || [])];
  document.getElementById("dash-timeline").innerHTML = timeline
    .slice()
    .reverse()
    .map(
      (e) =>
        `<li><strong>${e.title}</strong> <small>${e.createdAt}</small><br>${e.detail || ""}</li>`
    )
    .join("");

  const photos = [
    ...(data.photos?.survey || []).map((ph) => ph.url || ph.path || ""),
    ...(data.photos?.classified || []).map((ph) => ph.filePath),
  ].filter(Boolean);
  document.getElementById("dash-photos").innerHTML = photos
    .map((u) => `<img src="${u}" alt="" />`)
    .join("");

  document.getElementById("dash-links").innerHTML = `
    <h2>導線</h2>
    <p><a href="${data.links.business}">Business PWA</a> ·
    <a href="${data.links.drawing}">施工図</a> ·
    <a href="${data.links.proRemote}">PRO Remote</a> ·
    <a href="/customer-master">顧客台帳</a></p>`;
}

loadDashboard().catch(console.error);
renderPwaTopbar("business", "案件司令塔");

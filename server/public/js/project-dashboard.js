import { renderPwaTopbar } from "./tisly-pwa-shell.js";
import { highlightAnomalyCard, setWsDisconnectedBadge } from "./connection-badges.js";

const TOKEN_KEY = "tisly_token";
const projectId = window.location.pathname.split("/project/")[1]?.split("/")[0] ?? "";

const PIN_COLORS = { ONLINE: "#3fb950", WARNING: "#d29922", OFFLINE: "#f85149" };
const DIFF_COLORS = { added: "#1f6feb", removed: "#da3633", moved: "#d29922" };

let ws = null;
let wsReconnectTimer = null;
let userInteracting = false;
let interactionPauseUntil = 0;
let lastDashboard = null;
let blinkTimer = null;

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

function setWsStatus(state, detail = "") {
  const el = document.getElementById("dash-ws-status");
  if (!el) return;
  el.className = `ws-badge ws-${state}`;
  const labels = {
    connecting: "接続中…",
    online: "Live",
    offline: "オフライン",
    reconnecting: "再接続…",
  };
  el.textContent = `${labels[state] || state}${detail ? ` · ${detail}` : ""}`;
}

function isAutoJumpPaused() {
  return userInteracting || Date.now() < interactionPauseUntil;
}

function pauseAutoJump(ms = 30000) {
  interactionPauseUntil = Date.now() + ms;
}

function bindUserInteractionPause() {
  const stack = document.getElementById("dash-floor-stack");
  if (!stack || stack.dataset.pauseBound) return;
  stack.dataset.pauseBound = "1";
  const pause = () => {
    userInteracting = true;
    pauseAutoJump(45000);
    clearTimeout(stack._pauseTimer);
    stack._pauseTimer = setTimeout(() => {
      userInteracting = false;
    }, 2000);
  };
  stack.addEventListener("wheel", pause, { passive: true });
  stack.addEventListener("touchstart", pause, { passive: true });
  stack.addEventListener("mousedown", pause);
  stack.addEventListener("keydown", pause);
  stack.querySelectorAll(".floor-layer").forEach((layer) => {
    layer.addEventListener("click", () => {
      const tier = layer.dataset.tier;
      if (tier) sendProRemote("floor_nav", { tier });
    });
  });
  stack.querySelectorAll(".floor-pin").forEach((pin) => {
    pin.addEventListener("click", (ev) => {
      ev.stopPropagation();
      sendProRemote("pin_select", { pinId: pin.dataset.pinId });
    });
  });
}

function jumpToFloorTier(tier, opts = {}) {
  if (!tier) return;
  const target = document.getElementById(`floor-${tier}`);
  if (!target) return;
  if (opts.force || !isAutoJumpPaused()) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (opts.blink) {
    target.querySelectorAll(".floor-pin").forEach((pin) => {
      pin.classList.add("pin-blink");
    });
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => {
      target.querySelectorAll(".floor-pin").forEach((pin) => pin.classList.remove("pin-blink"));
    }, 10000);
  }
}

function renderFloorStack(stack, jumpOpts) {
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
            `<span class="floor-pin" data-pin-id="${p.id || p.deviceId || ""}" style="left:${p.posX}%;top:${p.posY}%;background:${PIN_COLORS[p.status] || PIN_COLORS.OFFLINE}" title="${p.label || p.pinType} (${p.status})">${(p.pinType || "?").slice(0, 2)}</span>`
        )
        .join("");
      return `<div class="floor-layer${layer.scrollTarget ? " anomaly" : ""}" id="floor-${layer.tier}" data-tier="${layer.tier}">
        <h3>${layer.displayName} ${layer.anomalyCount ? `<span class="badge err">${layer.anomalyCount} 異常</span>` : ""}</h3>
        <div class="floor-canvas">${pinHtml || "<p style='padding:1rem;color:#8b949e'>ピンなし</p>"}</div>
      </div>`;
    })
    .join("");
  bindUserInteractionPause();
  const tier = jumpOpts?.tier ?? stack.firstAnomalyTier;
  if (tier) {
    jumpToFloorTier(tier, { blink: jumpOpts?.blink, force: jumpOpts?.force });
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
          `<div class="notif-item${n.severity === "critical" ? " critical" : ""}">
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
      sendProRemote("ack", { notificationId: btn.dataset.ack });
      loadDashboard();
    });
  });
}

function scrollDiffPin(item) {
  const tier = lastDashboard?.floorStack?.firstAnomalyTier ?? "perimeter";
  jumpToFloorTier(tier, { force: true, blink: true });
  const layer = document.getElementById(`floor-${tier}`);
  if (!layer || item.posX == null) return;
  let pin = layer.querySelector(`[data-pin-id="${item.device?.id}"]`);
  if (!pin) {
    pin = document.createElement("span");
    pin.className = "floor-pin diff-highlight";
    pin.style.left = `${(item.posX ?? 0.5) * 100}%`;
    pin.style.top = `${(item.posY ?? 0.5) * 100}%`;
    pin.style.background = DIFF_COLORS[item.changeType] || "#fff";
    pin.title = item.device?.label || "";
    layer.querySelector(".floor-canvas")?.appendChild(pin);
  }
  pin.classList.add("pin-blink");
  setTimeout(() => pin.classList.remove("pin-blink"), 10000);
}

function renderDrawingDiff(diff) {
  const el = document.getElementById("dash-drawing-diff");
  if (!diff) {
    el.innerHTML = "";
    return;
  }
  const tabs = ["survey", "construction", "as_built"];
  const labels = { survey: "現調", construction: "施工", as_built: "完成" };
  const items = diff.items || [];
  el.innerHTML = `
    <div class="diff-tabs">${tabs.map((t, i) => `<button type="button" data-tab="${t}" class="${i === 0 ? "active" : ""}">${labels[t]}</button>`).join("")}</div>
    <div id="diff-list"></div>
    <h3 style="margin-top:1rem">差分一覧 v2</h3>
    <ul class="diff-items-list">
      ${items
        .map(
          (item) =>
            `<li><button type="button" class="diff-item-btn diff-${item.changeType}" data-change="${item.changeType}">
              <span class="diff-dot" style="background:${DIFF_COLORS[item.changeType]}"></span>
              ${item.changeType === "moved" ? `${item.from?.label}→${item.to?.label}` : item.device?.label}
              <small>(${item.changeType})</small>
            </button></li>`
        )
        .join("") || "<li>差分なし</li>"}
    </ul>`;
  const listEl = document.getElementById("diff-list");
  function showTab(t) {
    el.querySelectorAll(".diff-tabs button").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === t);
    });
    const tabItems = (diff[t] || []).map((d) => ({
      changeType: "added",
      device: d,
      posX: d.posX,
      posY: d.posY,
    }));
    listEl.innerHTML = tabItems.length
      ? `<ul>${tabItems.map((d) => `<li>${d.device.label}</li>`).join("")}</ul>`
      : "<p>機器なし</p>";
  }
  el.querySelectorAll(".diff-tabs button").forEach((b) => {
    b.addEventListener("click", () => showTab(b.dataset.tab));
  });
  el.querySelectorAll(".diff-item-btn").forEach((btn, idx) => {
    btn.addEventListener("click", () => scrollDiffPin(items[idx]));
  });
  showTab("survey");
}

function renderRetryQueue(items) {
  const el = document.getElementById("dash-retry-queue");
  if (!el) return;
  const modeLabel = (m) =>
    m === "realSend" ? "realSend" : m === "dryRun" ? "dryRun" : "mockOnly";
  el.innerHTML = `<h2>Gmail / QNAP 復旧キュー</h2>
    ${(items || [])
      .map(
        (it) =>
          `<div class="retry-item">
            <div><strong>${it.channel}</strong> · ${it.status} · <span class="send-mode">${modeLabel(it.sendMode)}</span>
            <br><small>${it.lastError || "—"} · 試行 ${it.attemptCount}</small></div>
            <div class="retry-actions">
              ${it.status !== "success" && it.status !== "cancelled" ? `<button type="button" data-retry="${it.id}">再送</button>` : ""}
              ${it.status !== "cancelled" ? `<button type="button" data-cancel="${it.id}">取消</button>` : ""}
              <button type="button" data-log="${it.id}">ログ</button>
            </div>
          </div>`
      )
      .join("") || "<p>キューなし</p>"}`;
  el.querySelectorAll("[data-retry]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/toms/projects/${projectId}/retry-queue/${btn.dataset.retry}/retry`, {
        method: "POST",
      });
      loadDashboard();
    });
  });
  el.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/toms/projects/${projectId}/retry-queue/${btn.dataset.cancel}/cancel`, {
        method: "POST",
      });
      loadDashboard();
    });
  });
  el.querySelectorAll("[data-log]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await api(`/api/toms/projects/${projectId}/retry-queue/${btn.dataset.log}/log`);
      const body = await res.json();
      alert((body.item?.log || []).map((l) => `${l.at}: ${l.message}`).join("\n") || "ログなし");
    });
  });
}

function renderAiEstimateSection(latest) {
  const el = document.getElementById("dash-ai-estimate");
  if (!el) return;
  if (!latest) {
    el.innerHTML = `<h2>AI見積 v3</h2><p>候補なし</p>
      <button type="button" id="btn-ai-gen">候補を生成</button>`;
  } else {
    el.innerHTML = `<h2>AI見積 v3</h2>
      <p>${latest.candidate?.recommended?.summary || latest.checklist?.join(" · ")}</p>
      <div class="ai-feedback-btns">
        <button type="button" data-feedback="adopted">採用</button>
        <button type="button" data-feedback="revised">修正</button>
        <button type="button" data-feedback="rejected">却下</button>
      </div>`;
  }
  document.getElementById("btn-ai-gen")?.addEventListener("click", async () => {
    await api(`/api/toms/projects/${projectId}/ai-estimate-v3`, { method: "POST" });
    loadDashboard();
  });
  el.querySelectorAll("[data-feedback]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/toms/projects/${projectId}/ai-estimate-v3/feedback`, {
        method: "POST",
        body: JSON.stringify({
          action: btn.dataset.feedback,
          estimateV3Id: latest?.id,
          candidate: latest?.candidate?.recommended,
        }),
      });
      loadDashboard();
    });
  });
}

function renderMaintenance(cases) {
  const el = document.getElementById("dash-maintenance");
  el.innerHTML = `${(cases || [])
    .map((c) => {
      const overdue = c.scheduledDate < new Date().toISOString().slice(0, 10) && c.status !== "closed";
      return `<div class="notif-item${overdue ? " critical" : ""}"><div><strong>${c.scheduledDate}</strong> ${c.content}<br>
        <small>${c.assignee || "—"} · ${c.status}${overdue ? " · 期限切れ" : ""} · 設備: ${(c.targetDevices || []).join(", ") || "—"}</small></div></div>`;
    })
    .join("") || "<p>保守案件なし</p>"}`;
}

function renderRcCards(cards) {
  const el = document.getElementById("dash-rc-grid");
  if (!el) return;
  if (!cards?.length) {
    el.innerHTML = "<p>RCカードなし</p>";
    return;
  }
  const statusClass = { ok: "badge", warn: "badge warn", pending: "badge warn", none: "badge err" };
  el.innerHTML = cards
    .map(
      (c) =>
        `<div class="card rc-card">
          <h3>${c.title} <span class="${statusClass[c.status] || "badge"}">${c.status}</span></h3>
          <p>${c.summary}</p>
          ${c.count != null ? `<p class="hint">${c.count} 件</p>` : ""}
          ${c.href ? `<a href="${c.href}">開く</a>` : ""}
        </div>`
    )
    .join("");
}

function applyDashboardData(data, jumpOpts) {
  lastDashboard = data;
  renderRcCards(data.rcCards);
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
    <p>施工履歴: ${(data.constructionHistory || []).length} 件</p>
    <button type="button" id="btn-estimate-v4" class="ai-feedback-btns" style="margin-top:0.5rem">見積作成（AI v4）</button>
    <div id="dash-estimate-v4-result"></div>`;
  document.getElementById("btn-estimate-v4")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-estimate-v4");
    btn.disabled = true;
    btn.textContent = "生成中…";
    try {
      const res = await api(`/api/field-operations/projects/${projectId}/estimate-v4`, {
        method: "POST",
        body: JSON.stringify({ runAnalysis: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || res.status);
      const cats = (body.candidates || [])
        .map((c) => `${c.category}: ${c.name} ×${c.quantity}`)
        .join("<br>");
      document.getElementById("dash-estimate-v4-result").innerHTML = `
        <p><strong>${body.estimate.estimateNo}</strong> 生成完了</p>
        <p class="hint">${cats}</p>
        <a href="/business/projects/${projectId}/estimate">見積を開く</a>`;
      loadDashboard();
    } catch (e) {
      document.getElementById("dash-estimate-v4-result").textContent = String(e.message || e);
    } finally {
      btn.disabled = false;
      btn.textContent = "見積作成（AI v4）";
    }
  });

  document.getElementById("dash-pro-remote").innerHTML = `
    <h2>PRO Remote</h2>
    <p>状態: <span class="${statusClass(data.proRemote?.status)}">${data.proRemote?.status}</span></p>
    <p><a href="${data.links?.proRemote}">PRO Remote を開く</a></p>`;

  renderNotifications(data.notifications);
  renderFloorStack(data.floorStack, jumpOpts);
  renderDevices(data.liveDevices);
  renderDrawingDiff(data.drawingDiff);
  renderMaintenance(data.maintenance);
  renderAiEstimateSection(data.aiEstimateV3);

  const timeline = [...(data.unifiedTimeline || data.timeline || [])];
  document.getElementById("dash-timeline").innerHTML = timeline
    .slice()
    .reverse()
    .map(
      (e) =>
        `<li><strong>[${e.category || ""}] ${e.title}</strong> <small>${e.createdAt}</small><br>${e.detail || ""}</li>`
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

  bindFieldActionButtons(data);
}

function bindFieldActionButtons(data) {
  const bar = document.getElementById("dash-field-actions");
  if (!bar || bar.dataset.bound) return;
  bar.dataset.bound = "1";

  const customerCode = data.project?.customerId?.startsWith("BCU-")
    ? "TOMS001"
    : data.project?.customerId || "TOMS001";

  document.getElementById("btn-field-estimate")?.addEventListener("click", () => {
    document.getElementById("btn-estimate-v4")?.click();
  });

  document.getElementById("btn-field-install")?.addEventListener("click", () => {
    window.open(`/customer/${customerCode}/install/home`, "_blank");
  });

  document.getElementById("btn-field-share")?.addEventListener("click", () => {
    const url = `${location.origin}/customer/${customerCode}`;
    if (navigator.share) {
      navigator.share({ title: "TiSLY 顧客ポータル", url }).catch(() => window.open(url, "_blank"));
    } else {
      window.open(url, "_blank");
    }
  });

  document.getElementById("btn-field-pro-remote")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-field-pro-remote");
    btn.disabled = true;
    btn.textContent = "反映中…";
    try {
      const res = await api(`/api/field-operations/projects/${projectId}/pro-remote-sync`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || res.status);
      alert(`PRO Remote に反映しました: ${(body.tiers || []).join(" / ")}`);
      window.open(lastDashboard?.links?.proRemote || `/customer/${customerCode}/pro-remote`, "_blank");
      loadDashboard();
    } catch (e) {
      alert(`PRO Remote 反映: ${e.message || e}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "PRO Remoteへ反映";
    }
  });
}

async function loadRetryQueue() {
  const res = await api(`/api/toms/projects/${projectId}/retry-queue`);
  if (res.ok) {
    const body = await res.json();
    renderRetryQueue(body.items);
  }
}

async function loadAiEstimate() {
  const res = await api(`/api/toms/projects/${projectId}/ai-estimate-v3/latest`);
  if (res.ok) {
    return res.json();
  }
  return null;
}

async function loadDashboard(jumpOpts) {
  if (!projectId) return;
  const res = await api(`/api/toms/projects/${projectId}/dashboard?rc=1`);
  if (!res.ok) {
    document.getElementById("dash-title").textContent = "案件が見つかりません";
    return;
  }
  const data = await res.json();
  data.aiEstimateV3 = await loadAiEstimate();
  applyDashboardData(data, jumpOpts);
  await loadRetryQueue();
}

function sendProRemote(action, extra = {}) {
  if (!ws || ws.readyState !== 1 || !projectId) return;
  ws.send(
    JSON.stringify({
      type: "pro_remote",
      projectId,
      action,
      actor: sessionStorage.getItem("tisly_username") || "dashboard",
      ...extra,
    })
  );
}

function connectWebSocket() {
  if (!projectId) return;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/ws`;
  setWsStatus("connecting");
  if (ws) {
    try {
      ws.close();
    } catch {
      /* */
    }
  }
  ws = new WebSocket(url);
  ws.onopen = () => {
    setWsStatus("online");
    setWsDisconnectedBadge(false);
    ws.send(JSON.stringify({ type: "subscribe", projectId }));
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "heartbeat") return;
      const payload = msg.payload || {};
      if (payload.projectId && payload.projectId !== projectId) return;
      if (payload.channel === "devices" && payload.devices) {
        renderDevices(payload.devices);
        if (payload.scrollTier) {
          jumpToFloorTier(payload.scrollTier, {
            blink: true,
            force: msg.type === "alarm",
          });
        }
      }
      if (payload.channel === "notifications" && payload.notifications) {
        renderNotifications(payload.notifications);
      }
      if (payload.channel === "timeline" && payload.entry) {
        const ul = document.getElementById("dash-timeline");
        const e = payload.entry;
        const li = document.createElement("li");
        li.innerHTML = `<strong>${e.title}</strong> <small>${e.createdAt}</small><br>${e.detail || ""}`;
        ul.prepend(li);
      }
      if (payload.channel === "floor_alert" && payload.tier) {
        jumpToFloorTier(payload.tier, {
          blink: payload.blinkPins,
          force: msg.type === "alarm",
        });
        highlightAnomalyCard(`#floor-${payload.tier}`);
      }
      if (payload.channel === "pro_mirror" && payload.action) {
        if (payload.action === "floor_nav" && payload.tier) {
          jumpToFloorTier(payload.tier, { force: true, blink: true });
        }
        if (payload.action === "pin_select" && payload.pinId) {
          document
            .querySelector(`[data-pin-id="${payload.pinId}"]`)
            ?.classList.add("pin-blink");
        }
        if (payload.action === "escalate") {
          highlightAnomalyCard("#dash-notifications");
        }
      }
    } catch {
      /* */
    }
  };
  ws.onclose = () => {
    setWsStatus("reconnecting");
    setWsDisconnectedBadge(true);
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(connectWebSocket, 4000);
  };
  ws.onerror = () => {
    setWsStatus("offline");
    setWsDisconnectedBadge(true);
  };
}

loadDashboard().catch(console.error);
connectWebSocket();
renderPwaTopbar("business", "案件司令塔");

/** TiSLY RP2350 Web UI — card layout, mobile-first */
(function () {
  const pages = ["home", "sensors", "relays", "events", "settings", "about"];

  function statusClass(kind) {
    if (kind === "ok") return "status-ok";
    if (kind === "warn") return "status-warn";
    if (kind === "offline") return "status-offline";
    return "status-alarm";
  }

  function overallStatus(st) {
    const hb = TislyMqtt.hbStatus();
    if (!st.connected || hb === "offline") {
      return { text: "通信断", kind: "offline" };
    }
    if (st.alarm || st.alarmMode) {
      return { text: "警報", kind: "alarm" };
    }
    if (hb === "alarm" || hb === "warn") {
      return { text: "通信に注意", kind: "warn" };
    }
    if (st.di.some((v) => v === 1)) {
      return { text: "センサー検知あり", kind: "warn" };
    }
    return { text: "正常", kind: "ok" };
  }

  function renderHome(st) {
    const s = overallStatus(st);
    return `
      <section class="hero ${statusClass(s.kind)}">
        <h2>${s.text}</h2>
        <p class="sub">${st.connected ? "MQTT 接続中" : "オフライン / デモ"}</p>
      </section>
      <div class="card-grid">
        <a class="card" href="#sensors"><span class="card-title">センサー</span><span class="card-val">${st.di.filter((x) => x).length} 検知</span></a>
        <a class="card" href="#relays"><span class="card-title">リレー</span><span class="card-val">${st.relay.filter((x) => x).length} ON</span></a>
        <a class="card" href="#events"><span class="card-title">イベント</span><span class="card-val">${st.events.length} 件</span></a>
      </div>
      ${st.alarm || st.alarmMode ? `<button type="button" class="btn btn-alarm" id="btn-clear-alarm">アラーム解除</button>` : ""}
    `;
  }

  function sensorCards(st, type) {
    const labels = type === "di" ? TISLY_CONFIG.labels.di : TISLY_CONFIG.labels.relay;
    const vals = type === "di" ? st.di : st.relay;
    const prefix = type === "di" ? "DI" : "RO";
    return labels
      .map((label, i) => {
        const on = vals[i] === 1;
        let sk = "ok";
        if (type === "di" && on) sk = "alarm";
        if (type === "relay" && on) sk = "warn";
        const stateText = type === "di" ? (on ? "検知" : "正常") : on ? "ON" : "OFF";
        return `
      <div class="sensor-card ${statusClass(sk)}">
        <span class="sensor-name">${prefix}${i + 1}</span>
        <span class="sensor-label">${label}</span>
        <span class="sensor-state">${stateText}</span>
      </div>`;
      })
      .join("");
  }

  function renderSensors(st) {
    return `
      <h2 class="page-title">センサー入力</h2>
      <div class="sensor-grid">${sensorCards(st, "di")}</div>
    `;
  }

  function renderRelays(st) {
    return `
      <h2 class="page-title">リレー出力</h2>
      <div class="sensor-grid">${sensorCards(st, "relay")}</div>
    `;
  }

  function renderEvents(st) {
    if (!st.events.length) {
      return `<p class="empty">イベントはまだありません</p>`;
    }
    return `<ul class="event-list">${st.events
      .map(
        (e) =>
          `<li><strong>${e.name || e.type || "event"}</strong> — ${e.message || JSON.stringify(e)}</li>`
      )
      .join("")}</ul>`;
  }

  function renderSettings() {
    const url = localStorage.getItem("tisly_ws_url") || TISLY_CONFIG.mqtt.wsUrl;
    return `
      <h2 class="page-title">設定</h2>
      <label class="field">MQTT WebSocket URL
        <input type="url" id="input-ws-url" value="${url}" placeholder="ws://192.168.1.10:9001" />
      </label>
      <p class="hint">トピック: <code>${TISLY_CONFIG.mqtt.topicPrefix}/#</code></p>
      <button type="button" class="btn" id="btn-save-settings">保存して再接続</button>
    `;
  }

  function renderAbout() {
    return `
      <h2 class="page-title">About</h2>
      <div class="about-card">
        <p><strong>TiSLY RP2350 Edition</strong></p>
        <p>Phase 11–20 基盤 · Waveshare RP2350 PoE (8DI/8RO)</p>
        <p>device: ${TISLY_CONFIG.deviceId}</p>
        <p>状態表示: 緑=正常 / 黄=注意 / 赤=警報 / 灰=通信断</p>
        <p class="muted">実機セットアップ: docs/rp2350_first_setup.md</p>
      </div>
    `;
  }

  function getPage() {
    const h = (location.hash || "#home").replace("#", "");
    return pages.includes(h) ? h : "home";
  }

  function render() {
    const page = getPage();
    document.querySelectorAll(".nav-item").forEach((a) => {
      a.classList.toggle("active", a.dataset.page === page);
    });
    const main = document.getElementById("main");
    TislyMqtt.subscribe((st) => {
      let html = "";
      if (page === "home") html = renderHome(st);
      else if (page === "sensors") html = renderSensors(st);
      else if (page === "relays") html = renderRelays(st);
      else if (page === "events") html = renderEvents(st);
      else if (page === "settings") html = renderSettings();
      else html = renderAbout();
      main.innerHTML = html;
      bindPage(page);
    });
  }

  function bindPage(page) {
    const btn = document.getElementById("btn-clear-alarm");
    if (btn) btn.onclick = () => TislyMqtt.clearAlarm();
    if (page === "settings") {
      const save = document.getElementById("btn-save-settings");
      if (save) {
        save.onclick = () => {
          localStorage.setItem("tisly_ws_url", document.getElementById("input-ws-url").value);
          location.reload();
        };
      }
    }
  }

  window.addEventListener("hashchange", render);
  document.addEventListener("DOMContentLoaded", () => {
    TislyMqtt.connect();
    render();
  });
})();

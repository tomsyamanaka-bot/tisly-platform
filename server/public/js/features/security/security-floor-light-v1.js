/**
 * セキュリティ俯瞰 — 同期バニラJS
 * ES module より先に動き、マップとボタンを確実に起動する
 */
(function () {
  "use strict";

  window.__TISLY_SF_LIGHT = true;
  window.__TISLY_SF_READY = true;
  window.__TISLY_SF_ORBIT_BOUND = true;
  window.__TISLY_SF_CTRL_BOUND = true;
  window.__TISLY_SF_FLOOR = "2f";

  var drum = {
    dragging: false,
    lastY: 0,
    accY: 0,
    pointerId: null,
  };
  var cameraIndex = 0;
  var cameras = [
    { id: "my-cam-entry", label: "玄関カメラ 01", scene: "entry" },
    { id: "my-cam-living", label: "LDKカメラ", scene: "lobby" },
    { id: "my-cam-park", label: "駐車カメラ", scene: "parking" },
  ];
  var alerting = false;

  function $(id) {
    return document.getElementById(id);
  }

  function layersOf(el) {
    return [].slice.call((el && el.querySelectorAll(".sf-iso-layer")) || []);
  }

  function applyOrbit() {
    var el = $("sf-iso-orbit");
    if (!el) return;
    var layers = layersOf(el);
    var n = Math.max(layers.length, 1);
    var step = 360 / n;
    var h = el.offsetHeight || 320;
    var tan = Math.tan(Math.PI / Math.max(n, 2));
    var radius = Math.max(72, Math.round(h / (2 * tan)));
    var focus = el.getAttribute("data-focus") || "2f";
    var index = 0;
    var i;
    for (i = 0; i < layers.length; i++) {
      if (layers[i].getAttribute("data-layer") === focus) index = i;
    }
    el.style.setProperty("--drum-step", step + "deg");
    el.style.setProperty("--drum-r", radius + "px");
    for (i = 0; i < layers.length; i++) {
      layers[i].style.setProperty("--drum-i", String(i));
      layers[i].classList.toggle("is-focus", i === index);
      layers[i].classList.toggle("is-dim", i !== index);
    }
    el.style.transform = "rotateX(" + -index * step + "deg)";
    window.__TISLY_SF_FLOOR =
      (layers[index] && layers[index].getAttribute("data-layer")) || focus;
  }

  function setFloor(id) {
    var orbitEl = $("sf-iso-orbit");
    if (!orbitEl) return;
    var layers = layersOf(orbitEl);
    var next = id || "2f";
    var found = false;
    var i;
    for (i = 0; i < layers.length; i++) {
      if (layers[i].getAttribute("data-layer") === next) found = true;
    }
    if (!found && layers[0]) next = layers[0].getAttribute("data-layer") || "2f";
    orbitEl.setAttribute("data-focus", next);
    window.__TISLY_SF_FLOOR = next;
    document.querySelectorAll("#sf-floor-tabs [data-floor]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-floor") === next);
    });
    document.querySelectorAll(".sf-iso-layer").forEach(function (layer) {
      var lid = layer.getAttribute("data-layer");
      layer.classList.toggle("is-focus", lid === next);
      layer.classList.toggle("is-dim", lid !== next);
    });
    applyOrbit();
  }

  function stepFloor(dir) {
    var el = $("sf-iso-orbit");
    var layers = layersOf(el);
    if (!layers.length) return;
    var focus = (el && el.getAttribute("data-focus")) || "2f";
    var index = 0;
    var i;
    for (i = 0; i < layers.length; i++) {
      if (layers[i].getAttribute("data-layer") === focus) index = i;
    }
    var next = layers[(index + dir + layers.length) % layers.length];
    setFloor(next.getAttribute("data-layer"));
  }

  function setLive(index) {
    if (!cameras.length) return;
    cameraIndex = ((index % cameras.length) + cameras.length) % cameras.length;
    var cam = cameras[cameraIndex];
    var feed = $("sf-live-feed");
    var xl = $("sf-live-xl");
    if (feed) {
      feed.className = "sf-live-feed scene-" + cam.scene;
      feed.innerHTML =
        '<span class="sf-live-badge">LIVE</span><div class="sf-scan"></div>';
    }
    if (xl) xl.className = "sf-live-feed is-xl scene-" + cam.scene;
    var title = $("sf-cam-title");
    if (title) {
      title.textContent = document.body.classList.contains("sf-customer")
        ? cam.label.replace("01", "")
        : "ライブカメラ · " + cam.label;
    }
    document.querySelectorAll(".sf-thumb").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-cam") === cam.id);
    });
  }

  function setAlertVisual(on) {
    alerting = !!on;
    var rooms = document.querySelectorAll(
      '[data-room-id="my-1f-entry"], [data-room-id="my-1f-living"], [data-room-id*="entry"], [data-room-id*="living"]'
    );
    var layer = document.querySelector('[data-layer="1f"]');
    var pins = document.querySelectorAll(
      '[data-sensor-id="my-door-front"], [data-sensor-id*="door-front"], [data-layer="1f"] .sf-pin'
    );
    var panel = $("sf-alarm-panel");
    rooms.forEach(function (room) {
      room.classList.toggle("is-alert", alerting);
      room.classList.toggle("pulse-alarm", alerting);
    });
    if (layer) layer.classList.toggle("is-alert", alerting);
    pins.forEach(function (pin) {
      pin.classList.toggle("is-alert", alerting);
    });
    if (panel) panel.classList.toggle("is-live", alerting);
    var status = $("sf-status-label");
    var emoji = $("sf-status-emoji");
    if (status) {
      status.textContent = alerting
        ? document.body.classList.contains("sf-customer")
          ? "異常があります"
          : "発報があります"
        : document.body.classList.contains("sf-customer")
          ? "正常に動いています"
          : "正常です";
    }
    if (emoji) emoji.textContent = alerting ? "🔴" : "🟢";
    var count = $("sf-alarm-count");
    if (count) count.textContent = alerting ? "1件発生中" : "0件発生中";
    var bell = $("sf-bell-count");
    if (bell) bell.textContent = alerting ? "1" : "0";
    var list = $("sf-alarm-list");
    if (list) {
      list.innerHTML = alerting
        ? "<li><b>1F 玄関ホール</b><span>侵入検知 · エントランス</span></li>"
        : "<li>発報はありません</li>";
    }
    var detail = $("sf-alarm-detail");
    if (detail) {
      detail.innerHTML = alerting
        ? "<div><dt>場所</dt><dd>1F 玄関ホール</dd></div><div><dt>デバイス</dt><dd>玄関ドアセンサー</dd></div><div><dt>種別</dt><dd>侵入検知</dd></div><div><dt>ステータス</dt><dd><em class=\"st-open\">未対応</em></dd></div>"
        : "<p>選択中の警報はありません</p>";
    }
  }

  function siteId() {
    var sel = $("sf-site-select");
    return (sel && sel.value) || "SEC-JP-MORIYA-001";
  }

  function postJson(url, body) {
    return fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(function () {
      return null;
    });
  }

  function exportCsv() {
    var rows = ["時刻,フロア,場所,種別,デバイス,ステータス,対応者"];
    document.querySelectorAll("#sf-log-body tr").forEach(function (tr) {
      var cells = [].slice.call(tr.querySelectorAll("td")).map(function (td) {
        return '"' + String(td.textContent || "").replace(/"/g, '""') + '"';
      });
      if (cells.length) rows.push(cells.join(","));
    });
    if (rows.length === 1) {
      rows.push('"デモ出力","1F","玄関ホール","侵入検知","玄関ドアセンサー","未対応",""');
    }
    var blob = new Blob(["\uFEFF" + rows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tisly-alarm-log.csv";
    a.click();
  }

  function bindOrbit() {
    applyOrbit();
    var wrap = $("sf-map-wrap");
    if (!wrap) return;
    wrap.addEventListener("pointerdown", function (e) {
      drum.dragging = true;
      drum.lastY = e.clientY;
      drum.accY = 0;
      drum.pointerId = e.pointerId;
      wrap.classList.add("is-dragging");
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch (_err) {
        /* ignore */
      }
    });
    wrap.addEventListener(
      "pointermove",
      function (e) {
        if (!drum.dragging) return;
        if (drum.pointerId != null && e.pointerId !== drum.pointerId) return;
        drum.accY += e.clientY - drum.lastY;
        drum.lastY = e.clientY;
        if (e.cancelable) e.preventDefault();
      },
      { passive: false }
    );
    function up(e) {
      if (!drum.dragging) return;
      if (drum.pointerId != null && e.pointerId !== drum.pointerId) return;
      if (drum.accY > 42) stepFloor(1);
      else if (drum.accY < -42) stepFloor(-1);
      drum.dragging = false;
      drum.pointerId = null;
      drum.accY = 0;
      wrap.classList.remove("is-dragging");
    }
    wrap.addEventListener("pointerup", up);
    wrap.addEventListener("pointercancel", up);
    wrap.addEventListener(
      "wheel",
      function (e) {
        if (Math.abs(e.deltaY) < 8) return;
        e.preventDefault();
        stepFloor(e.deltaY > 0 ? 1 : -1);
      },
      { passive: false }
    );
  }

  function bindControls() {
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var floorBtn = t.closest("#sf-floor-tabs [data-floor]");
      if (floorBtn && !floorBtn.disabled) {
        setFloor(floorBtn.getAttribute("data-floor"));
        return;
      }
      var modeBtn = t.closest("#sf-modes [data-mode]");
      if (modeBtn) {
        document.querySelectorAll("#sf-modes [data-mode]").forEach(function (b) {
          b.classList.toggle("is-on", b === modeBtn);
        });
        var mode = modeBtn.getAttribute("data-mode");
        if (mode === "disarmed") setAlertVisual(false);
        postJson("/api/security-floor/v1/guard-mode", {
          siteId: siteId(),
          mode: mode,
        });
        return;
      }
      var thumb = t.closest("#sf-cam-thumbs [data-cam]");
      if (thumb) {
        var id = thumb.getAttribute("data-cam");
        var i = cameras.findIndex(function (c) {
          return c.id === id;
        });
        setLive(i >= 0 ? i : cameraIndex);
        return;
      }
      var pin = t.closest("#sf-map-wrap [data-camera]");
      if (pin) {
        var camId = pin.getAttribute("data-camera");
        var pi = cameras.findIndex(function (c) {
          return c.id === camId;
        });
        setLive(pi >= 0 ? pi : cameraIndex);
        return;
      }
    });

    $("sf-demo-alert") &&
      $("sf-demo-alert").addEventListener("click", function () {
        setAlertVisual(!alerting);
        if (alerting) setFloor("1f");
        postJson("/api/security-floor/v1/test-notify", { siteId: siteId() });
      });
    $("sf-ack") &&
      $("sf-ack").addEventListener("click", function () {
        setAlertVisual(false);
        postJson("/api/security-floor/v1/alarm-ack", { siteId: siteId() });
      });
    $("sf-light-on") &&
      $("sf-light-on").addEventListener("click", function () {
        $("sf-map-wrap") && $("sf-map-wrap").classList.add("is-lights-on");
        postJson("/api/security-floor/v1/lighting", {
          siteId: siteId(),
          on: true,
        });
      });
    $("sf-light-off") &&
      $("sf-light-off").addEventListener("click", function () {
        $("sf-map-wrap") && $("sf-map-wrap").classList.remove("is-lights-on");
        postJson("/api/security-floor/v1/lighting", {
          siteId: siteId(),
          on: false,
        });
      });
    $("sf-cam-next") &&
      $("sf-cam-next").addEventListener("click", function () {
        setLive(cameraIndex + 1);
      });
    $("sf-cam-expand") &&
      $("sf-cam-expand").addEventListener("click", function () {
        var note = $("sf-play-note");
        if (note) note.hidden = true;
        $("sf-live-dialog") && $("sf-live-dialog").showModal && $("sf-live-dialog").showModal();
      });
    $("sf-cam-play") &&
      $("sf-cam-play").addEventListener("click", function () {
        var note = $("sf-play-note");
        if (note) note.hidden = false;
        $("sf-live-dialog") && $("sf-live-dialog").showModal && $("sf-live-dialog").showModal();
      });
    $("sf-export") && $("sf-export").addEventListener("click", exportCsv);
    document.querySelectorAll(".sf-mobile-tabs button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pane = btn.getAttribute("data-pane");
        document.querySelectorAll(".sf-mobile-tabs button").forEach(function (b) {
          b.classList.toggle("is-on", b === btn);
        });
        document.body.setAttribute("data-pane", pane);
        var target = document.querySelector(
          '.sf-soc-shell [data-pane="' + pane + '"]'
        );
        if (target && target.scrollIntoView) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  function hideHomeFab() {
    document.querySelectorAll(".hqs-fab, .hqs-overlay").forEach(function (el) {
      el.remove();
    });
  }

  bindOrbit();
  bindControls();
  setFloor("2f");
  setLive(0);
  $("sf-map-wrap") && $("sf-map-wrap").classList.add("is-lights-on");
  var status = $("sf-status-label");
  if (status && /読み込み中/.test(status.textContent || "")) {
    status.textContent = document.body.classList.contains("sf-customer")
      ? "正常に動いています"
      : "正常です";
  }
  hideHomeFab();
  setTimeout(hideHomeFab, 400);
})();

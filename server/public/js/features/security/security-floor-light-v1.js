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

  var orbit = {
    dragZ: 0,
    pitch: 55,
    dragging: false,
    lastX: 0,
    lastY: 0,
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

  function applyOrbit() {
    var el = $("sf-iso-orbit");
    if (!el) return;
    var vh = Math.max(120, window.innerHeight * 0.85);
    var scrollZ = ((window.scrollY || 0) / vh) * 360;
    var z = ((scrollZ + orbit.dragZ) % 360 + 360) % 360;
    el.style.transform =
      "rotateX(" + orbit.pitch + "deg) rotateZ(" + z + "deg)";
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

  function setFloor(id) {
    var orbitEl = $("sf-iso-orbit");
    if (orbitEl) orbitEl.setAttribute("data-focus", id || "all");
    document.querySelectorAll("#sf-floor-tabs [data-floor]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-floor") === id);
    });
    document.querySelectorAll(".sf-iso-layer").forEach(function (layer) {
      var lid = layer.getAttribute("data-layer");
      var on = id === "all" || lid === id;
      layer.classList.toggle("is-focus", id !== "all" && lid === id);
      layer.classList.toggle("is-dim", !on);
    });
  }

  function setAlertVisual(on) {
    alerting = !!on;
    var room =
      document.querySelector('[data-room-id="my-1f-entry"]') ||
      document.querySelector('[data-room-id*="entry"]') ||
      document.querySelector('[data-layer="1f"] .sf-room');
    var layer = document.querySelector('[data-layer="1f"]');
    var pin =
      document.querySelector('[data-sensor-id="my-door-front"]') ||
      document.querySelector('[data-sensor-id*="door-front"]') ||
      document.querySelector('[data-layer="1f"] .sf-pin.is-sens');
    var panel = $("sf-alarm-panel");
    if (room) {
      room.classList.toggle("is-alert", alerting);
      room.classList.toggle("pulse-alarm", alerting);
    }
    if (layer) layer.classList.toggle("is-alert", alerting);
    if (pin) pin.classList.toggle("is-alert", alerting);
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

  function bindOrbit() {
    applyOrbit();
    window.addEventListener("scroll", applyOrbit, { passive: true });
    window.addEventListener("resize", applyOrbit);
    var wrap = $("sf-map-wrap");
    if (!wrap) return;
    wrap.addEventListener("pointerdown", function (e) {
      orbit.dragging = true;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      orbit.pointerId = e.pointerId;
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
        if (!orbit.dragging) return;
        if (orbit.pointerId != null && e.pointerId !== orbit.pointerId) return;
        var dx = e.clientX - orbit.lastX;
        var dy = e.clientY - orbit.lastY;
        orbit.lastX = e.clientX;
        orbit.lastY = e.clientY;
        orbit.dragZ += dx * 0.45;
        orbit.pitch = Math.min(72, Math.max(28, orbit.pitch - dy * 0.18));
        if (e.cancelable) e.preventDefault();
        applyOrbit();
      },
      { passive: false }
    );
    function up(e) {
      if (!orbit.dragging) return;
      if (orbit.pointerId != null && e.pointerId !== orbit.pointerId) return;
      orbit.dragging = false;
      orbit.pointerId = null;
      wrap.classList.remove("is-dragging");
    }
    wrap.addEventListener("pointerup", up);
    wrap.addEventListener("pointercancel", up);
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
    $("sf-export") &&
      $("sf-export").addEventListener("click", function () {
        var blob = new Blob(
          ["時刻,フロア,場所,種別,デバイス,ステータス\nデモ出力"],
          { type: "text/csv;charset=utf-8" }
        );
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "tisly-alarm-log.csv";
        a.click();
      });
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
  setFloor("all");
  setLive(0);
  $("sf-map-wrap") && $("sf-map-wrap").classList.add("is-lights-on");
  hideHomeFab();
  setTimeout(hideHomeFab, 400);
})();

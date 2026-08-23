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
  window.__TISLY_SF_FLOOR = "1f";

  var drum = {
    dragging: false,
    lastY: 0,
    lastX: 0,
    accY: 0,
    accX: 0,
    pointerId: null,
    onIso3d: false,
    mode: null,
  };
  var cameraIndex = 0;
  var cameras = [
    { id: "my-cam-katte", label: "勝手口カメラ 01", scene: "backdoor" },
    { id: "my-cam-living", label: "リビング洋カメラ", scene: "lobby" },
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
    var focus = el.getAttribute("data-focus") || "1f";
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
    var next = id || "1f";
    var found = false;
    var i;
    for (i = 0; i < layers.length; i++) {
      if (layers[i].getAttribute("data-layer") === next) found = true;
    }
    if (!found && layers[0]) next = layers[0].getAttribute("data-layer") || "1f";
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
    try {
      if (window.TislySecurityIso3d && window.TislySecurityIso3d.setFloor) {
        window.TislySecurityIso3d.setFloor(next);
      }
    } catch (_e) {
      /* ignore */
    }
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
      '[data-room-id="my-1f-katte"], [data-room-id*="katte"]'
    );
    var layer = document.querySelector('[data-layer="1f"]');
    var pins = document.querySelectorAll(
      '[data-sensor-id="my-door-katte"], [data-sensor-id="my-lock-katte"], [data-sensor-id="my-gas-katte"], [data-sensor-id="my-panel-50a"], [data-sensor-id="my-cam-katte"], [data-room-id="my-1f-katte"] ~ .sf-pin, [data-layer="1f"] [data-sensor-id*="katte"]'
    );
    var panel = $("sf-alarm-panel");
    rooms.forEach(function (room) {
      room.classList.toggle("is-alert", alerting);
      room.classList.toggle("pulse-alarm", alerting);
      room.classList.toggle("alert-beacon", alerting);
    });
    if (layer) {
      layer.classList.toggle("is-alert", alerting);
      layer.classList.toggle("alert-beacon", alerting);
    }
    pins.forEach(function (pin) {
      pin.classList.toggle("is-alert", alerting);
      pin.classList.toggle("alert-beacon", alerting);
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
        ? "<li><b>1F 勝手口キッチン</b><span>開放検知 · 勝手口ドア</span></li>"
        : "<li>発報はありません</li>";
    }
    var detail = $("sf-alarm-detail");
    if (detail) {
      detail.innerHTML = alerting
        ? "<div><dt>場所</dt><dd>1F 勝手口キッチン</dd></div><div><dt>デバイス</dt><dd>勝手口ドアセンサー（20m）</dd></div><div><dt>種別</dt><dd>開放検知</dd></div><div><dt>ステータス</dt><dd><em class=\"st-open\">未対応</em></dd></div>"
        : "<p>選択中の警報はありません</p>";
    }
    try {
      if (window.TislySecurityIso3d && window.TislySecurityIso3d.setAlert) {
        window.TislySecurityIso3d.setAlert(alerting);
      }
    } catch (_e) {
      /* ignore */
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
      rows.push('"デモ出力","1F","勝手口キッチン","開放検知","勝手口ドアセンサー（20m）","未対応",""');
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
    function is3dTarget(t) {
      return !!(
        t &&
        t.closest &&
        (t.closest("#sf-iso3d-mount") ||
          t.closest(".sf-iso3d-canvas") ||
          t.closest(".sf-iso3d-labels") ||
          t.closest(".sf-iso3d-pin"))
      );
    }
    function setOrbitRotate(on) {
      try {
        if (window.TislySecurityIso3d && window.TislySecurityIso3d.setOrbitEnabled) {
          window.TislySecurityIso3d.setOrbitEnabled(on);
        }
      } catch (_e) {
        /* ignore */
      }
    }
    wrap.addEventListener("pointerdown", function (e) {
      drum.dragging = true;
      drum.onIso3d = is3dTarget(e.target);
      drum.lastY = e.clientY;
      drum.lastX = e.clientX;
      drum.accY = 0;
      drum.accX = 0;
      drum.mode = null;
      drum.pointerId = e.pointerId;
      if (!drum.onIso3d) {
        wrap.classList.add("is-dragging");
        try {
          wrap.setPointerCapture(e.pointerId);
        } catch (_err) {
          /* ignore */
        }
      }
    });
    wrap.addEventListener(
      "pointermove",
      function (e) {
        if (!drum.dragging) return;
        if (drum.pointerId != null && e.pointerId !== drum.pointerId) return;
        var dy = e.clientY - drum.lastY;
        var dx = e.clientX - drum.lastX;
        drum.lastY = e.clientY;
        drum.lastX = e.clientX;
        drum.accY += dy;
        drum.accX += dx;
        if (drum.onIso3d) {
          if (!drum.mode) {
            if (Math.abs(drum.accY) > 14 || Math.abs(drum.accX) > 14) {
              drum.mode =
                Math.abs(drum.accY) > Math.abs(drum.accX) * 1.15
                  ? "floor"
                  : "orbit";
              if (drum.mode === "floor") {
                setOrbitRotate(false);
                wrap.classList.add("is-dragging");
              }
            }
          }
          if (drum.mode === "floor") {
            if (e.cancelable) e.preventDefault();
            if (drum.accY > 48) {
              stepFloor(1);
              drum.accY = 0;
            } else if (drum.accY < -48) {
              stepFloor(-1);
              drum.accY = 0;
            }
          }
          return;
        }
        if (e.cancelable) e.preventDefault();
      },
      { passive: false }
    );
    function up(e) {
      if (!drum.dragging) return;
      if (drum.pointerId != null && e.pointerId !== drum.pointerId) return;
      if (!drum.onIso3d || drum.mode === "floor") {
        if (drum.accY > 42) stepFloor(1);
        else if (drum.accY < -42) stepFloor(-1);
      }
      setOrbitRotate(true);
      drum.dragging = false;
      drum.pointerId = null;
      drum.accY = 0;
      drum.accX = 0;
      drum.mode = null;
      drum.onIso3d = false;
      wrap.classList.remove("is-dragging");
    }
    wrap.addEventListener("pointerup", up);
    wrap.addEventListener("pointercancel", up);
    wrap.addEventListener(
      "wheel",
      function (e) {
        /* 3D上もホイールで階層切替（ズームはピンチ） */
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
        postJson("/api/security-floor/v1/test-notify", { siteId: siteId() }).then(
          function (res) {
            if (!res || !res.ok) return;
            return res.json().then(function (data) {
              if (data && data.push && data.push.success === false) {
                window.alert(
                  "通知テスト: " +
                    (data.push.hint || data.push.error || "Push 送信失敗")
                );
              }
            });
          }
        );
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
  setFloor("1f");
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
  setTimeout(function () {
    try {
      if (window.TislySecurityIso3d && window.TislySecurityIso3d.mount) {
        window.TislySecurityIso3d.mount();
        window.TislySecurityIso3d.setFloor(window.__TISLY_SF_FLOOR || "1f");
      }
    } catch (_e) {
      /* ignore */
    }
  }, 0);
})();

/**
 * Builder → Security 非破壊ブリッジ
 * localStorage の tisly_floorplan_config を俯瞰 SVG に反映
 * 既存 DOM / ロジックは壊さず追記のみ
 */
(function () {
  "use strict";

  var LS_KEY = "tisly_floorplan_config";
  var FLAG = "tisly_floorplan_for_security";

  function wantsBuilderMap() {
    try {
      var q = new URLSearchParams(location.search || "");
      if (q.get("fromBuilder") === "1") return true;
      return localStorage.getItem(FLAG) === "1";
    } catch (e) {
      return false;
    }
  }

  function loadConfig() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function roomsSvg(rooms) {
    return (rooms || [])
      .map(function (r) {
        var tx = r.x + r.w / 2;
        var ty = r.y + r.h / 2;
        return (
          '<rect class="sf-room" data-room-id="' +
          escapeHtml(r.id) +
          '" x="' +
          r.x +
          '" y="' +
          r.y +
          '" width="' +
          r.w +
          '" height="' +
          r.h +
          '" rx="2"></rect>' +
          '<text class="sf-room-label" x="' +
          tx +
          '" y="' +
          ty +
          '" text-anchor="middle">' +
          escapeHtml(r.label) +
          "</text>"
        );
      })
      .join("");
  }

  function openingsSvg(openings) {
    return (openings || [])
      .map(function (o) {
        return (
          '<g class="sf-pin is-sens" data-sensor-id="' +
          escapeHtml(o.id) +
          '" transform="translate(' +
          o.x +
          " " +
          o.y +
          ')">' +
          '<circle class="sf-pin-pulse" r="8"></circle>' +
          '<circle class="sf-pin-bg" r="5.6"></circle>' +
          '<text class="sf-pin-icon" y="0.6">●</text></g>'
        );
      })
      .join("");
  }

  function applyFloor(layerEl, floorId, config) {
    if (!layerEl || !config) return;
    var floor = (config.floors || []).find(function (f) {
      return f.id === floorId;
    });
    if (!floor || !floor.enabled) return;
    var svg = layerEl.querySelector("svg.sf-map");
    if (!svg) return;
    var slab =
      '<rect class="sf-iso-slab" x="2" y="2" width="96" height="96" rx="3"></rect>';
    svg.innerHTML =
      slab + roomsSvg(floor.rooms) + openingsSvg(floor.openings);
  }

  function banner(name) {
    var hero = document.querySelector(".sf-soc-hero") || document.body;
    if (!hero || document.getElementById("fpb-bridge-banner")) return;
    var el = document.createElement("div");
    el.id = "fpb-bridge-banner";
    el.setAttribute("role", "status");
    el.style.cssText =
      "margin:8px 12px;padding:10px 14px;border-radius:10px;" +
      "background:#ECFDF5;border:1px solid #6EE7B7;color:#065F46;" +
      "font-weight:700;font-size:0.9rem;";
    el.textContent =
      "3D Floorplan Builder の間取りを表示中: " + (name || "カスタム");
    hero.insertBefore(el, hero.firstChild);
  }

  function run() {
    if (!wantsBuilderMap()) return;
    var config = loadConfig();
    if (!config || !config.floors) {
      // サーバーからフォールバック
      fetch("/api/floorplan-builder/v1/active")
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data && data.ok && data.config) {
            try {
              localStorage.setItem(LS_KEY, JSON.stringify(data.config));
            } catch (e) {}
            applyConfig(data.config);
          }
        })
        .catch(function () {});
      return;
    }
    applyConfig(config);
  }

  function applyConfig(config) {
    banner(config.name);
    document.querySelectorAll(".sf-iso-layer").forEach(function (layer) {
      var id = layer.getAttribute("data-layer");
      applyFloor(layer, id, config);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();

/**
 * 天文タイマーの切替ボタン。
 * 緯度経度は送らず、サーバーの計算を表示する。
 */
(function () {
  const OPTIONS = [-30, -15, 0, 15, 30];

  function fillSelect(el, current, fallback) {
    if (!el) return;
    if (el.dataset.filled !== "1") {
      el.innerHTML = OPTIONS.map((n) => {
        const sign = n > 0 ? "+" : "";
        return `<option value="${n}">${sign}${n}分</option>`;
      }).join("");
      el.dataset.filled = "1";
    }
    const n = Number(current);
    el.value = String(OPTIONS.includes(n) ? n : fallback);
  }

  function paint(prefix, view) {
    const root = document.getElementById(`${prefix}-astro`);
    if (!root) return;
    const mode =
      view && view.mode === "astronomical" ? "astronomical" : "manual";
    root.querySelectorAll("[data-astro-mode]").forEach((btn) => {
      btn.classList.toggle(
        "is-on",
        btn.getAttribute("data-astro-mode") === mode
      );
    });
    const show = mode === "astronomical";
    const label = document.getElementById(`${prefix}-astro-label`);
    const offsets = document.getElementById(`${prefix}-astro-offsets`);
    if (label) {
      label.hidden = !show;
      label.textContent = (view && view.label) || "";
    }
    if (offsets) offsets.hidden = !show;
    fillSelect(
      document.getElementById(`${prefix}-astro-sunset`),
      view && view.sunset,
      -15
    );
    fillSelect(
      document.getElementById(`${prefix}-astro-sunrise`),
      view && view.sunrise,
      15
    );
    const start = view && view.startId ? document.getElementById(view.startId) : null;
    const end = view && view.endId ? document.getElementById(view.endId) : null;
    if (start) start.disabled = show;
    if (end) end.disabled = show;
  }

  function read(prefix) {
    const root = document.getElementById(`${prefix}-astro`);
    const on = root && root.querySelector(".sf-astro-mode.is-on");
    const mode =
      on && on.getAttribute("data-astro-mode") === "astronomical"
        ? "astronomical"
        : "manual";
    const sunset = document.getElementById(`${prefix}-astro-sunset`);
    const sunrise = document.getElementById(`${prefix}-astro-sunrise`);
    return {
      lightingScheduleMode: mode,
      sunsetOffsetMin: Number(sunset && sunset.value !== "" ? sunset.value : -15),
      sunriseOffsetMin: Number(
        sunrise && sunrise.value !== "" ? sunrise.value : 15
      ),
    };
  }

  window.TislyAstroScheduleUiV1 = { paint, read };
})();

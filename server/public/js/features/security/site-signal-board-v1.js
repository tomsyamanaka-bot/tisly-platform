/**
 * 社内の信号機一覧。
 * お客様画面には読み込まない。
 * 行を押すと物件選択が切り替わる。
 */
(function () {
  const API = "/api/home/v1/sites/summary";
  let rows = [];
  let counts = { ok: 0, warning: 0, critical: 0 };
  let problemsOnly = false;
  let open = true;

  function $(id) {
    return document.getElementById(id);
  }

  function headText() {
    return (
      "🚦 全物件 稼働サマリー" +
      `（正常 ${counts.ok}件 / 注意 ${counts.warning}件 / 異常 ${counts.critical}件）`
    );
  }

  function visibleRows() {
    if (!problemsOnly) return rows;
    return rows.filter((row) => row.healthLevel !== "ok");
  }

  function line(row) {
    const temp =
      row.boardTempC == null ? "温度 —" : `${Number(row.boardTempC).toFixed(1)}℃`;
    const up = row.uptimeLabel && row.uptimeLabel !== "—" ? row.uptimeLabel : "稼働 —";
    const ver = row.runningVersion || "版 —";
    return `${row.statusLabel} · ${temp} · ${up} · ${ver}`;
  }

  function paint() {
    const head = $("sf-signal-head");
    if (head) head.textContent = headText();
    const body = $("sf-signal-body");
    if (body) body.hidden = !open;
    const toggle = $("sf-signal-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    const filter = $("sf-signal-filter");
    if (filter) {
      filter.textContent = problemsOnly ? "すべて表示" : "異常・注意のみ表示";
      filter.classList.toggle("is-on", problemsOnly);
    }
    const list = $("sf-signal-list");
    if (!list) return;
    const selected = $("sf-site-select")?.value || "";
    const shown = visibleRows();
    if (!shown.length) {
      list.innerHTML = `<li class="sf-signal-empty">表示する物件はありません</li>`;
      return;
    }
    list.innerHTML = shown
      .map((row) => {
        const on = row.securitySiteId === selected ? " is-current" : "";
        const name = escapeHtml(row.displayName);
        const code = escapeHtml(row.customerCode || "");
        return `<li>
          <button type="button" class="sf-signal-row is-${row.healthLevel}${on}" data-signal-site="${escapeHtml(
            row.securitySiteId
          )}">
            <span class="sf-signal-name">${name}<small>${code}</small></span>
            <span class="sf-signal-state">${escapeHtml(line(row))}</span>
          </button>
        </li>`;
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function reload() {
    const res = await fetch(API, { cache: "no-store" });
    const data = await res.json();
    if (!data || !data.ok) throw new Error("summary failed");
    rows = Array.isArray(data.sites) ? data.sites : [];
    counts = {
      ok: data.counts?.ok || 0,
      warning: data.counts?.warning || 0,
      critical: data.counts?.critical || 0,
    };
    paint();
  }

  function choose(securitySiteId) {
    const sel = $("sf-site-select");
    if (!sel) return;
    const has = [...sel.options].some((opt) => opt.value === securitySiteId);
    if (!has) return;
    sel.value = securitySiteId;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    paint();
  }

  function bind() {
    $("sf-signal-toggle")?.addEventListener("click", () => {
      open = !open;
      paint();
    });
    $("sf-signal-filter")?.addEventListener("click", () => {
      problemsOnly = !problemsOnly;
      paint();
    });
    $("sf-signal-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-signal-site]");
      if (!btn) return;
      choose(btn.getAttribute("data-signal-site"));
    });
    $("sf-site-select")?.addEventListener("change", () => paint());
  }

  bind();
  reload().catch(() => {
    const head = $("sf-signal-head");
    if (head) head.textContent = "🚦 全物件 稼働サマリー（取得待ち）";
  });
  window.TislySiteSignalBoardV1 = { reload };
})();

/**
 * 社内の信号機と物件の増減。
 * お客様画面には読み込まない。
 * 行を押すと物件選択が切り替わる。
 */
(function () {
  const API = "/api/home/v1/sites/summary";
  const LIFE = "/api/home/v1/sites/lifecycle";
  const UNITS = "/api/home/v1/sites/units";
  let rows = [];
  let catalog = [];
  let counts = { ok: 0, warning: 0, critical: 0 };
  let problemsOnly = false;
  let showExtras = false;
  let open = true;
  let pendingDeleteId = "";

  function $(id) {
    return document.getElementById(id);
  }

  function headText() {
    return (
      "🚦 全物件 稼働サマリー" +
      `（正常 ${counts.ok}件 / 注意 ${counts.warning}件 / 異常 ${counts.critical}件）`
    );
  }

  function lifeOf(row) {
    return row.lifecycleStatus || "active";
  }

  function visibleRows() {
    const active = rows.filter((row) => lifeOf(row) === "active");
    const shown = problemsOnly
      ? active.filter((row) => row.healthLevel !== "ok")
      : active;
    if (!showExtras) return shown;
    const extra = rows.filter((row) => {
      const life = lifeOf(row);
      return life === "demo" || life === "archived";
    });
    return shown.concat(extra);
  }

  function line(row) {
    const life = lifeOf(row);
    const badge =
      life === "demo" ? "🧪 デモ · " : life === "archived" ? "📦 アーカイブ · " : "";
    const temp =
      row.boardTempC == null ? "温度 —" : `${Number(row.boardTempC).toFixed(1)}℃`;
    const up = row.uptimeLabel && row.uptimeLabel !== "—" ? row.uptimeLabel : "稼働 —";
    const ver = row.runningVersion || "版 —";
    return `${badge}${row.statusLabel} · ${temp} · ${up} · ${ver}`;
  }

  function syncSelect() {
    const sel = $("sf-site-select");
    if (!sel) return;
    const byId = new Map(rows.map((row) => [row.securitySiteId, row]));
    for (const opt of sel.options) {
      const row = byId.get(opt.value);
      const life = row ? lifeOf(row) : "active";
      opt.hidden = life === "archived" && !showExtras;
    }
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
    const extra = $("sf-signal-extra");
    if (extra) {
      extra.textContent = showExtras ? "デモ・アーカイブを隠す" : "デモ・アーカイブを表示";
      extra.classList.toggle("is-on", showExtras);
    }
    syncSelect();
    const list = $("sf-signal-list");
    if (!list) return;
    const selected = $("sf-site-select")?.value || "";
    const shown = visibleRows();
    if (!shown.length) {
      list.innerHTML = `<li class="sf-signal-empty">表示する物件はありません</li>`;
    } else {
      list.innerHTML = shown
        .map((row) => {
          const on = row.securitySiteId === selected ? " is-current" : "";
          const life = lifeOf(row);
          const name = escapeHtml(row.displayName);
          const code = escapeHtml(row.customerCode || "");
          return `<li>
            <button type="button" class="sf-signal-row is-${row.healthLevel} is-${life}${on}" data-signal-site="${escapeHtml(
              row.securitySiteId
            )}">
              <span class="sf-signal-name">${name}<small>${code}</small></span>
              <span class="sf-signal-state">${escapeHtml(line(row))}</span>
            </button>
          </li>`;
        })
        .join("");
    }
    paintLife();
  }

  function selectedSite() {
    const id = $("sf-site-select")?.value || "";
    return catalog.find((site) => site.securitySiteId === id) || null;
  }

  function paintLife() {
    const site = selectedSite();
    const name = $("sf-life-site");
    if (name) {
      name.textContent = site
        ? `対象: ${site.displayName}（${site.customerCode}）`
        : "対象: —";
    }
    const status = site?.lifecycleStatus || "active";
    document.querySelectorAll("[data-life-status]").forEach((btn) => {
      btn.classList.toggle("is-on", btn.getAttribute("data-life-status") === status);
    });
    const del = $("sf-life-delete");
    const lock = $("sf-life-lock");
    const locked = !site || status === "active";
    if (del) del.disabled = locked;
    if (lock) lock.hidden = !locked;
    const list = $("sf-life-units");
    if (!list) return;
    const units = site?.units || [];
    if (!units.length) {
      list.innerHTML = `<li class="sf-life-empty">ユニットはありません</li>`;
      return;
    }
    list.innerHTML = units
      .map((unit) => {
        const on = unit.presence === "active";
        const kind = unit.kind === "modbus" ? "子機 RS485" : unit.role === "parent" ? "親機" : "子機";
        const bus = unit.modbusId ? ` · ID ${escapeHtml(unit.modbusId)}` : "";
        const guard = unit.role === "parent" || units.length <= 1;
        return `<li class="sf-life-unit">
          <span><b>${escapeHtml(unit.name)}</b><small>${kind}${bus}</small></span>
          <button type="button" class="sf-life-presence ${on ? "is-on" : ""}" data-unit-presence="${escapeHtml(
            unit.id
          )}">${on ? "🟢 設置済み・監視中" : "⏸️ 未設置・準備中"}</button>
          <button type="button" class="sf-life-remove" data-unit-delete="${escapeHtml(
            unit.id
          )}" ${guard ? "disabled" : ""}>🗑️ 削除</button>
        </li>`;
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || "保存に失敗しました");
    }
    return data;
  }

  async function reload() {
    const [summaryRes, lifeRes] = await Promise.all([
      fetch(API, { cache: "no-store" }),
      fetch(LIFE, { cache: "no-store" }),
    ]);
    const data = await summaryRes.json();
    const life = await lifeRes.json();
    if (!data || !data.ok) throw new Error("summary failed");
    rows = Array.isArray(data.sites) ? data.sites : [];
    catalog = Array.isArray(life.sites) ? life.sites : [];
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
    const opt = [...sel.options].find((item) => item.value === securitySiteId);
    if (!opt) return;
    opt.hidden = false;
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
    $("sf-signal-extra")?.addEventListener("click", () => {
      showExtras = !showExtras;
      paint();
    });
    $("sf-signal-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-signal-site]");
      if (!btn) return;
      choose(btn.getAttribute("data-signal-site"));
    });
    $("sf-site-select")?.addEventListener("change", () => paint());
    document.querySelectorAll("[data-life-status]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const site = selectedSite();
        if (!site) return;
        btn.disabled = true;
        try {
          await postJson(LIFE, {
            siteId: site.siteId,
            lifecycleStatus: btn.getAttribute("data-life-status"),
          });
          await reload();
        } catch (err) {
          console.warn("[site-life]", err);
        } finally {
          btn.disabled = false;
        }
      });
    });
    $("sf-life-delete")?.addEventListener("click", () => {
      const site = selectedSite();
      if (!site || site.lifecycleStatus === "active") return;
      pendingDeleteId = site.siteId;
      const modal = $("sf-life-modal");
      const text = $("sf-life-modal-text");
      if (text) {
        text.textContent = `${site.displayName} を一覧と監視から外します。点灯設定の保存は残します。`;
      }
      if (modal) modal.hidden = false;
    });
    $("sf-life-cancel")?.addEventListener("click", () => {
      pendingDeleteId = "";
      const modal = $("sf-life-modal");
      if (modal) modal.hidden = true;
    });
    $("sf-life-confirm")?.addEventListener("click", async () => {
      if (!pendingDeleteId) return;
      const btn = $("sf-life-confirm");
      if (btn) btn.disabled = true;
      try {
        await postJson(`${LIFE}/delete`, {
          siteId: pendingDeleteId,
          confirm: "削除",
        });
        pendingDeleteId = "";
        const modal = $("sf-life-modal");
        if (modal) modal.hidden = true;
        await reload();
      } catch (err) {
        console.warn("[site-life] delete", err);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    $("sf-life-units")?.addEventListener("click", async (e) => {
      const site = selectedSite();
      if (!site) return;
      const presence = e.target.closest("[data-unit-presence]");
      const remove = e.target.closest("[data-unit-delete]");
      try {
        if (presence) {
          const unit = site.units.find(
            (item) => item.id === presence.getAttribute("data-unit-presence")
          );
          if (!unit) return;
          await postJson(UNITS, {
            siteId: site.siteId,
            action: "presence",
            unitId: unit.id,
            presence: unit.presence === "active" ? "planned" : "active",
          });
          await reload();
        }
        if (remove && !remove.disabled) {
          await postJson(UNITS, {
            siteId: site.siteId,
            action: "delete",
            unitId: remove.getAttribute("data-unit-delete"),
          });
          await reload();
        }
      } catch (err) {
        console.warn("[site-life] unit", err);
      }
    });
    $("sf-life-add")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const site = selectedSite();
      if (!site) return;
      const form = e.currentTarget;
      const body = {
        siteId: site.siteId,
        action: "add",
        name: form.unitName.value,
        kind: form.unitKind.value,
        modbusId: form.unitModbus.value,
        presence: form.unitPresence.value,
        role: "child",
      };
      try {
        await postJson(UNITS, body);
        form.reset();
        await reload();
      } catch (err) {
        console.warn("[site-life] add", err);
      }
    });
  }

  bind();
  reload().catch(() => {
    const head = $("sf-signal-head");
    if (head) head.textContent = "🚦 全物件 稼働サマリー（取得待ち）";
  });
  window.TislySiteSignalBoardV1 = {
    reload,
    syncSelect,
  };
})();

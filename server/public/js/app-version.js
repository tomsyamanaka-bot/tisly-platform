function formatIsoShort(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", { hour12: false });
  } catch {
    return iso;
  }
}

function renderFacts(el, facts) {
  if (!el) return;
  el.innerHTML = facts
    .map(
      ([label, value]) =>
        `<div class="deploy-fact"><dt>${label}</dt><dd>${value}</dd></div>`
    )
    .join("");
}

function renderHistoryList(el, entries, emptyLabel) {
  if (!el) return;
  if (!entries?.length) {
    el.innerHTML = `<p class="hint">${emptyLabel}</p>`;
    return;
  }
  el.innerHTML = entries
    .map(
      (e) =>
        `<div class="version-history-item status-${e.status}">
          <div class="vh-row"><strong>${e.type}</strong> <span class="vh-badge">${e.status}</span></div>
          <div class="vh-row">Build ${e.build} · Commit ${e.commitShort}</div>
          <div class="vh-row vh-meta">${formatIsoShort(e.at)}${e.actor ? ` · ${e.actor}` : ""}</div>
          ${e.message ? `<div class="vh-msg">${e.message}</div>` : ""}
        </div>`
    )
    .join("");
}

async function loadVersionHistory() {
  try {
    const res = await fetch("/api/deploy/history");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const v = data.buildVersion || {};

    renderFacts(document.getElementById("version-current-facts"), [
      ["Label", v.label || "TiSLY RC2"],
      ["Build", v.build || "—"],
      ["Commit", v.commitShort || v.commit || "—"],
      ["Date", v.date || "—"],
      ["Phase", v.phase || "—"],
    ]);

    renderHistoryList(
      document.getElementById("version-build-list"),
      data.builds,
      "Build 履歴なし"
    );
    renderHistoryList(
      document.getElementById("version-deploy-list"),
      data.deploys,
      "Deploy 履歴なし"
    );
    renderHistoryList(
      document.getElementById("version-rollback-list"),
      data.rollbacks,
      "Rollback 履歴なし"
    );
  } catch (e) {
    document.querySelectorAll(".version-history-list").forEach((el) => {
      el.textContent = `読み込み失敗: ${e.message || e}`;
    });
  }
}

loadVersionHistory();

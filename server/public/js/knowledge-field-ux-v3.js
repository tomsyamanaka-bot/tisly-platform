/** Knowledge Field UX V3 — インライン表示 / QNAPコピー改善 / 使ったログAPI / ランキング */

export {
  MOTHERSHIP_UNC,
  MOTHERSHIP_HOST,
  STORAGE_V2_RECENT_SEARCH,
  STORAGE_V2_FAVORITES,
  STORAGE_V2_RECENT_KNOWLEDGE,
  STORAGE_V2_LAST_RESULTS,
  STORAGE_V2_USED_LOG,
  readJson,
  writeJson,
  escapeHtml,
  hitCapabilities,
  buildQnapLinksClient,
  resolveHitQnapPath,
  pushRecentSearchV2,
  saveLastSearchResultsV2,
  loadLastSearchResultsV2,
  toggleFavoriteKnowledgeV2,
  renderFlagRow,
  buildHitActionButtons,
  bindHitCardActions,
} from "./knowledge-field-ux-v2.js";

import {
  readJson,
  writeJson,
  escapeHtml,
  STORAGE_V2_RECENT_KNOWLEDGE,
  STORAGE_V2_USED_LOG,
  STORAGE_V2_RECENT_SEARCH,
  buildQnapLinksClient,
  resolveHitQnapPath,
} from "./knowledge-field-ux-v2.js";

export const STORAGE_V3_RECENT_LIMIT = 20;
export const STORAGE_V3_SEARCH_LIMIT = 20;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

/** QNAP 場所 — 4種類のコピーを選べるモーダル（V3） */
export function showQnapModalV3(relativePath, title, toastFn) {
  const links = buildQnapLinksClient(relativePath);
  const folderPath =
    links.folderPath ??
    (links.relativePath.includes("/")
      ? links.smbPath.replace(/\\[^\\]+$/, "")
      : links.smbPath);
  const fileName =
    links.fileName || links.relativePath.split("/").pop() || links.relativePath;

  let overlay = document.getElementById("qnap-modal-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "qnap-modal-overlay";
    overlay.className = "qnap-modal-overlay";
    document.body.appendChild(overlay);
  }

  const copyOptions = [
    { label: "SMBパス", value: links.smbPath, hint: "エクスプローラーに貼り付け" },
    { label: "File Station URL", value: links.webUrl, hint: "ブラウザで開く想定URL" },
    { label: "フォルダパス", value: folderPath, hint: "フォルダのみ" },
    { label: "ファイル名", value: fileName, hint: "ファイル名のみ" },
  ];

  overlay.innerHTML = `
    <div class="qnap-modal qnap-modal-v3" role="dialog" aria-labelledby="qnap-modal-title">
      <h3 id="qnap-modal-title">📁 QNAP保存場所</h3>
      <p class="qnap-modal-sub">${escapeHtml(title || links.relativePath)}</p>
      <div class="qnap-copy-grid">
        ${copyOptions
          .map(
            (opt) => `
          <button type="button" class="qnap-copy-option" data-copy="${escapeHtml(opt.value)}">
            <strong>${escapeHtml(opt.label)}</strong>
            <code>${escapeHtml(opt.value)}</code>
            <small>${escapeHtml(opt.hint)}</small>
          </button>`
          )
          .join("")}
      </div>
      <p class="qnap-hint">タップでコピー — 直接開けない場合は SMB パスをエクスプローラーへ</p>
      <button type="button" class="friendly-btn primary qnap-close-btn" style="width:100%;min-height:2.75rem;margin-top:0.5rem;">閉じる</button>
    </div>
  `;

  overlay.classList.add("show");
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.classList.remove("show");
  };
  overlay.querySelector(".qnap-close-btn")?.addEventListener("click", () => overlay.classList.remove("show"));
  overlay.querySelectorAll(".qnap-copy-option").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      const ok = await copyText(text);
      toastFn?.(ok ? "コピーしました" : "コピーに失敗しました");
    });
  });
}

/** 添付カード V3 — PDF/写真インライン、3DPrint ファイルカード */
export function renderAttachmentCardV3(att) {
  const type = att.fileType || "other";
  const hasUrl = Boolean(att.previewUrl || att.openUrl);
  const qnapRel = att.qnapPath || att.sourcePath || "";

  let previewBlock = "";
  if (type === "pdf" && att.previewUrl) {
    previewBlock = `<div class="attach-inline-pdf">
      <iframe src="${escapeHtml(att.previewUrl)}" title="${escapeHtml(att.label)}" loading="lazy"></iframe>
      <a class="attach-open-tab" href="${escapeHtml(att.openUrl || att.previewUrl)}" target="_blank" rel="noopener">別タブで開く</a>
    </div>`;
  } else if (type === "photo" && (att.previewUrl || att.openUrl)) {
    const src = att.previewUrl || att.openUrl;
    previewBlock = `<img class="attach-inline-photo" src="${escapeHtml(src)}" alt="${escapeHtml(att.label)}" loading="lazy" />`;
  } else if (["stl", "step", "gcode"].includes(type)) {
    previewBlock = `<div class="attach-file-card attach-3d-card">
      <span class="attach-file-icon">${type === "stl" ? "🖨 STL" : type === "step" ? "📐 STEP" : "⚙ GCode"}</span>
      <span class="attach-file-name">${escapeHtml(att.label)}</span>
    </div>`;
  } else if (hasUrl) {
    previewBlock = `<div class="attach-preview-placeholder">📎 ファイル<small>タップで開く</small></div>`;
  } else {
    const icons = { pdf: "📄", photo: "📷", other: "📎" };
    previewBlock = `<div class="attach-preview-placeholder attach-no-url">
      ${icons[type] || "📎"} ${escapeHtml(type.toUpperCase())}
      <small>QNAPパスをコピー</small>
    </div>`;
  }

  const actions = [];
  if (att.openUrl) {
    actions.push(
      `<a class="attach-open-btn attach-open-btn-lg" href="${escapeHtml(att.openUrl)}" target="_blank" rel="noopener">開く</a>`
    );
  }
  if (qnapRel) {
    actions.push(
      `<button type="button" class="attach-qnap-btn attach-qnap-btn-lg" data-qnap="${escapeHtml(qnapRel)}" data-title="${escapeHtml(att.label)}">QNAP</button>`
    );
  }
  if (!hasUrl && qnapRel) {
    actions.push(
      `<button type="button" class="attach-copy-btn" data-copy="${escapeHtml(qnapRel)}">パスコピー</button>`
    );
  }

  const pathDisplay = att.sourcePath || att.qnapPath || "—";
  const modeHint =
    att.deliveryMode === "placeholder"
      ? '<span class="attach-mode-hint">実ファイル未設定 — QNAP/File Station を利用</span>'
      : att.fileExists
        ? `<span class="attach-mode-hint ok">${escapeHtml(att.deliveryMode || "local")} 配信</span>`
        : "";

  return `<div class="attach-card attach-card-v3" data-type="${escapeHtml(type)}">
    ${previewBlock}
    <div class="attach-card-body">
      <strong>${escapeHtml(att.label)}</strong>
      ${modeHint}
      <code class="attach-path">${escapeHtml(pathDisplay)}</code>
      <div class="attach-actions">${actions.join("")}</div>
    </div>
  </div>`;
}

export function bindAttachmentCardsV3(container, toastFn) {
  container.querySelectorAll(".attach-qnap-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      showQnapModalV3(btn.getAttribute("data-qnap") || "", btn.getAttribute("data-title") || "", toastFn);
    });
  });
  container.querySelectorAll(".attach-copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      const ok = await copyText(text);
      toastFn?.(ok ? "パスをコピーしました" : "コピーに失敗しました");
    });
  });
}

export function pushRecentKnowledgeV3(item) {
  if (!item?.id) return;
  let recent = readJson(STORAGE_V2_RECENT_KNOWLEDGE, []);
  recent = [
    { ...item, openedAt: new Date().toISOString() },
    ...recent.filter((x) => x.id !== item.id || x.kind !== item.kind),
  ].slice(0, STORAGE_V3_RECENT_LIMIT);
  writeJson(STORAGE_V2_RECENT_KNOWLEDGE, recent);
}

export function pushRecentSearchV3(query) {
  const trimmed = query.trim();
  if (!trimmed) return;
  let recent = readJson(STORAGE_V2_RECENT_SEARCH, []);
  recent = [trimmed, ...recent.filter((x) => x !== trimmed)].slice(0, STORAGE_V3_SEARCH_LIMIT);
  writeJson(STORAGE_V2_RECENT_SEARCH, recent);
}

export function logKnowledgeUsedV3(entry, token) {
  const logEntry = {
    knowledgeId: entry.knowledgeId,
    title: entry.title,
    kind: entry.kind,
    category: entry.category,
    usedAt: new Date().toISOString(),
    query: entry.query || "",
    projectId: entry.projectId || "",
  };
  const log = readJson(STORAGE_V2_USED_LOG, []);
  log.unshift(logEntry);
  writeJson(STORAGE_V2_USED_LOG, log.slice(0, 200));

  if (token) {
    fetch("/api/knowledge/usage-log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        knowledgeId: entry.knowledgeId,
        title: entry.title,
        query: entry.query,
        projectId: entry.projectId,
        category: entry.category,
        kind: entry.kind,
        source: entry.source || "field",
      }),
    }).catch(() => {
      /* オフライン時は localStorage のみ */
    });
  }
}

export function aggregateLocalUsageRankingV3(limit = 10) {
  const log = readJson(STORAGE_V2_USED_LOG, []);
  const map = new Map();
  for (const e of log) {
    const key = e.knowledgeId;
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        knowledgeId: key,
        title: e.title,
        count: 1,
        lastUsedAt: e.usedAt,
        category: e.category || "—",
        kind: e.kind,
      });
      continue;
    }
    existing.count += 1;
    if (e.usedAt > existing.lastUsedAt) {
      existing.lastUsedAt = e.usedAt;
      existing.title = e.title || existing.title;
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, limit);
}

export async function fetchUsageRankingV3(token, limit = 10) {
  try {
    const res = await fetch(`/api/knowledge/usage-log/ranking?limit=${limit}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.ranking)) {
      return data.ranking;
    }
  } catch {
    /* fallback */
  }
  return aggregateLocalUsageRankingV3(limit);
}

export function mergeUsageRankings(serverRanking, localRanking, limit = 10) {
  const map = new Map();
  for (const item of [...serverRanking, ...localRanking]) {
    const key = item.knowledgeId;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item });
      continue;
    }
    existing.count += item.count || 1;
    if ((item.lastUsedAt || "") > (existing.lastUsedAt || "")) {
      existing.lastUsedAt = item.lastUsedAt;
      existing.title = item.title || existing.title;
      existing.category = item.category || existing.category;
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || (b.lastUsedAt || "").localeCompare(a.lastUsedAt || ""))
    .slice(0, limit);
}

export function renderUsageRankingHtml(ranking) {
  if (!ranking?.length) {
    return '<p class="status-muted">まだ記録がありません — 「✓ 使った」で蓄積</p>';
  }
  return `<div class="recent-knowledge-list">${ranking
    .map((item) => {
      const kind = item.kind ? `&kind=${encodeURIComponent(item.kind)}` : "";
      const href = `/knowledge-detail-v1?id=${encodeURIComponent(item.knowledgeId)}${kind}`;
      const date = item.lastUsedAt ? item.lastUsedAt.slice(0, 10) : "—";
      return `<a class="recent-knowledge-item ranking-item" href="${href}">
        <span class="rank-count">${item.count}回</span>
        <span class="recent-knowledge-title">${escapeHtml(item.title)}</span>
        <small>${escapeHtml(item.category || "—")} · 最終 ${escapeHtml(date)}</small>
      </a>`;
    })
    .join("")}</div>`;
}

export function renderRecentKnowledgeHtml(items) {
  if (!items?.length) {
    return '<p class="status-muted">まだありません</p>';
  }
  return `<div class="recent-knowledge-list">${items
    .map((item) => {
      const kind = item.kind ? `&kind=${encodeURIComponent(item.kind)}` : "";
      const href = `/knowledge-detail-v1?id=${encodeURIComponent(item.id)}${kind}`;
      return `<a class="recent-knowledge-item" href="${href}">
        <span class="recent-knowledge-title">${escapeHtml(item.title)}</span>
        <small>${escapeHtml(item.category || item.kind || "—")}</small>
      </a>`;
    })
    .join("")}</div>`;
}

export function buildHitActionButtonsV3(hit, flags, detailUrl) {
  const actions = [];
  if (flags.pdf && hit.openUrl) {
    actions.push(`<a class="action-pdf-lg" href="${escapeHtml(hit.openUrl)}" target="_blank" rel="noopener">📄 PDFを見る</a>`);
  }
  if (flags.photo && hit.openUrl) {
    actions.push(`<a class="action-photo-lg" href="${escapeHtml(hit.openUrl)}">📷 写真を見る</a>`);
  }
  if (flags.qnap) {
    actions.push(
      `<button type="button" class="qnap-link-btn" data-qnap="${escapeHtml(resolveHitQnapPath(hit))}" data-title="${escapeHtml(hit.title)}">📁 QNAP場所</button>`
    );
  }
  actions.push(`<a class="primary" href="${detailUrl}">詳細</a>`);
  if ((hit.relatedCount ?? 0) > 0 || (hit.tags?.length ?? 0) > 0) {
    actions.push(`<a href="${detailUrl}#related">関連ナレッジ</a>`);
  }
  actions.push(
    `<button type="button" class="used-btn full" data-id="${escapeHtml(hit.id)}" data-kind="${escapeHtml(hit.kind)}" data-title="${escapeHtml(hit.title)}" data-category="${escapeHtml(hit.category || "")}">✓ 使った</button>`
  );
  return actions;
}

export function bindHitCardActionsV3(container, toastFn, onUsed) {
  container.querySelectorAll(".qnap-link-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showQnapModalV3(btn.getAttribute("data-qnap") || "", btn.getAttribute("data-title") || "", toastFn);
    });
  });
  container.querySelectorAll(".used-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onUsed?.({
        knowledgeId: btn.getAttribute("data-id") || "",
        kind: btn.getAttribute("data-kind") || "",
        title: btn.getAttribute("data-title") || "",
        category: btn.getAttribute("data-category") || "",
      });
    });
  });
}

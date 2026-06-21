/** Knowledge Field UX V2 — 現場向け共有（QNAP深リンク / キャッシュ / 添付カード / 使ったログ） */

export const MOTHERSHIP_UNC = "\\\\192.168.1.10\\TiSLY";
export const MOTHERSHIP_HOST = "192.168.1.10";

export const STORAGE_V2_RECENT_SEARCH = "tisly_knowledge_v2_recent_search";
export const STORAGE_V2_FAVORITES = "tisly_knowledge_v2_favorites";
export const STORAGE_V2_RECENT_KNOWLEDGE = "tisly_knowledge_v2_recent_knowledge";
export const STORAGE_V2_LAST_RESULTS = "tisly_knowledge_v2_last_results";
export const STORAGE_V2_USED_LOG = "tisly_knowledge_v2_used_log";

export function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 検索ヒットの能力フラグ（API値優先、なければ推定） */
export function hitCapabilities(hit) {
  return {
    photo: hit.hasPhoto ?? (hit.kind === "photo" || (hit.tags || []).some((t) => /写真|photo/i.test(t))),
    pdf: hit.hasPdf ?? (hit.kind === "pdf" || Boolean(hit.openUrl?.includes("document-viewer"))),
    plc: hit.hasPlc ?? (hit.kind === "plc" || hit.kind === "esp"),
    print3d:
      hit.has3dPrint ??
      (hit.kind === "3dprint" || (hit.fileFormats || []).some((f) => /stl|step|gcode/i.test(f))),
    qnap: hit.hasQnap ?? Boolean(hit.qnapPath || hit.filePath || hit.projectNo),
    project: hit.hasProject ?? (hit.kind === "project" || Boolean(hit.projectNo)),
  };
}

export function buildQnapLinksClient(relativePath) {
  const rel = String(relativePath ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\\/g, "/");
  const smbSegments = rel ? rel.split("/").filter(Boolean) : [];
  const smbPath = smbSegments.length
    ? `${MOTHERSHIP_UNC}\\${smbSegments.join("\\")}`
    : MOTHERSHIP_UNC;
  const webUrl = rel
    ? `http://${MOTHERSHIP_HOST}/cgi-bin/filemanager/utilRequest.cgi?func=locate&path=/${rel}`
    : `http://${MOTHERSHIP_HOST}/cgi-bin/filemanager/`;
  return { smbPath, webUrl, copyPath: smbPath, relativePath: rel };
}

export function resolveHitQnapPath(hit) {
  if (hit.qnapPath) return hit.qnapPath;
  if (hit.filePath?.startsWith("AI/")) return hit.filePath;
  if (hit.kind === "plc" && hit.filePath) return `PLC/${hit.filePath.replace(/^[/\\]+/, "")}`;
  if (hit.kind === "3dprint" && hit.filePath) return `3DPrint/${hit.filePath.replace(/^[/\\]+/, "")}`;
  if (hit.kind === "project" && hit.projectNo) return `Projects/${hit.projectNo}`;
  if (hit.kind === "candidate") return `AI/Candidates/${hit.id}.json`;
  return hit.filePath || `AI/KnowledgeCards/${hit.id}.json`;
}

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

/** QNAP 深リンクモーダルを表示 */
export function showQnapModal(relativePath, title, toastFn) {
  const links = buildQnapLinksClient(relativePath);
  let overlay = document.getElementById("qnap-modal-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "qnap-modal-overlay";
    overlay.className = "qnap-modal-overlay";
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="qnap-modal" role="dialog" aria-labelledby="qnap-modal-title">
      <h3 id="qnap-modal-title">📁 QNAP保存場所</h3>
      <p class="qnap-modal-sub">${escapeHtml(title || links.relativePath)}</p>
      <label>Windows SMB パス</label>
      <div class="qnap-path-row">
        <code class="qnap-path-text">${escapeHtml(links.smbPath)}</code>
        <button type="button" class="qnap-copy-btn" data-copy="${escapeHtml(links.smbPath)}">コピー</button>
      </div>
      <label>QNAP File Station（想定URL）</label>
      <div class="qnap-path-row">
        <code class="qnap-path-text small">${escapeHtml(links.webUrl)}</code>
        <button type="button" class="qnap-copy-btn" data-copy="${escapeHtml(links.webUrl)}">コピー</button>
      </div>
      <label>相対パス</label>
      <div class="qnap-path-row">
        <code class="qnap-path-text">${escapeHtml(links.relativePath || "—")}</code>
        <button type="button" class="qnap-copy-btn" data-copy="${escapeHtml(links.relativePath)}">コピー</button>
      </div>
      <p class="qnap-hint">直接オープンできない場合は SMB パスをコピーしてエクスプローラーへ貼り付けてください。</p>
      <button type="button" class="friendly-btn primary qnap-close-btn" style="width:100%;min-height:2.75rem;margin-top:0.5rem;">閉じる</button>
    </div>
  `;

  overlay.classList.add("show");
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.classList.remove("show");
  };
  overlay.querySelector(".qnap-close-btn")?.addEventListener("click", () => overlay.classList.remove("show"));
  overlay.querySelectorAll(".qnap-copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      const ok = await copyText(text);
      toastFn?.(ok ? "パスをコピーしました" : "コピーに失敗しました");
    });
  });
}

const ATTACHMENT_ICONS = {
  pdf: "📄",
  photo: "📷",
  stl: "🖨",
  step: "🖨",
  gcode: "🖨",
  other: "📎",
};

const ATTACHMENT_LABELS = {
  pdf: "PDF",
  photo: "写真",
  stl: "STL",
  step: "STEP",
  gcode: "GCode",
  other: "ファイル",
};

/** 添付ファイルカード（プレビュー未対応時は placeholder） */
export function renderAttachmentCard(att) {
  const type = att.fileType || "other";
  const icon = ATTACHMENT_ICONS[type] || "📎";
  const label = ATTACHMENT_LABELS[type] || "ファイル";
  const hasPreview = Boolean(att.previewUrl);
  const previewBlock = hasPreview
    ? `<img class="attach-preview-img" src="${escapeHtml(att.previewUrl)}" alt="${escapeHtml(att.label)}" loading="lazy" />`
    : `<div class="attach-preview-placeholder">${icon} ${escapeHtml(label)}<small>プレビュー準備中</small></div>`;

  const actions = [];
  if (att.openUrl) {
    actions.push(`<a class="attach-open-btn" href="${escapeHtml(att.openUrl)}">開く</a>`);
  }
  if (att.qnapPath || att.sourcePath) {
    actions.push(
      `<button type="button" class="attach-qnap-btn" data-qnap="${escapeHtml(att.qnapPath || att.sourcePath)}" data-title="${escapeHtml(att.label)}">QNAP</button>`
    );
  }

  return `<div class="attach-card" data-type="${escapeHtml(type)}">
    ${previewBlock}
    <div class="attach-card-body">
      <strong>${escapeHtml(att.label)}</strong>
      <code class="attach-path">${escapeHtml(att.sourcePath || "—")}</code>
      <div class="attach-actions">${actions.join("")}</div>
    </div>
  </div>`;
}

export function bindAttachmentCards(container, toastFn) {
  container.querySelectorAll(".attach-qnap-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      showQnapModal(btn.getAttribute("data-qnap") || "", btn.getAttribute("data-title") || "", toastFn);
    });
  });
}

export function pushRecentSearchV2(query) {
  const trimmed = query.trim();
  if (!trimmed) return;
  let recent = readJson(STORAGE_V2_RECENT_SEARCH, []);
  recent = [trimmed, ...recent.filter((x) => x !== trimmed)].slice(0, 12);
  writeJson(STORAGE_V2_RECENT_SEARCH, recent);
}

export function saveLastSearchResultsV2(query, hits) {
  writeJson(STORAGE_V2_LAST_RESULTS, {
    query,
    savedAt: new Date().toISOString(),
    hits: (hits || []).slice(0, 10).map((h) => ({
      id: h.id,
      kind: h.kind,
      title: h.title,
      category: h.category,
      projectNo: h.projectNo,
      qnapPath: h.qnapPath,
      openUrl: h.openUrl,
      hasPhoto: h.hasPhoto,
      hasPdf: h.hasPdf,
      hasPlc: h.hasPlc,
      has3dPrint: h.has3dPrint,
    })),
  });
}

export function loadLastSearchResultsV2() {
  return readJson(STORAGE_V2_LAST_RESULTS, null);
}

export function pushRecentKnowledgeV2(item) {
  if (!item?.id) return;
  let recent = readJson(STORAGE_V2_RECENT_KNOWLEDGE, []);
  recent = [{ ...item, openedAt: new Date().toISOString() }, ...recent.filter((x) => x.id !== item.id)].slice(0, 15);
  writeJson(STORAGE_V2_RECENT_KNOWLEDGE, recent);
}

export function toggleFavoriteKnowledgeV2(item) {
  if (!item?.id) return false;
  let favs = readJson(STORAGE_V2_FAVORITES, []);
  const exists = favs.some((f) => f.id === item.id && f.kind === item.kind);
  if (exists) {
    favs = favs.filter((f) => !(f.id === item.id && f.kind === item.kind));
    writeJson(STORAGE_V2_FAVORITES, favs);
    return false;
  }
  favs = [{ id: item.id, kind: item.kind, title: item.title, savedAt: new Date().toISOString() }, ...favs].slice(0, 30);
  writeJson(STORAGE_V2_FAVORITES, favs);
  return true;
}

export function logKnowledgeUsedV2(entry) {
  const log = readJson(STORAGE_V2_USED_LOG, []);
  log.unshift({
    knowledgeId: entry.knowledgeId,
    title: entry.title,
    kind: entry.kind,
    usedAt: new Date().toISOString(),
    query: entry.query || "",
    projectId: entry.projectId || "",
  });
  writeJson(STORAGE_V2_USED_LOG, log.slice(0, 100));
}

export function renderFlagRow(flags, onlyOn = true) {
  const items = [
    { on: flags.pdf, label: "📄 PDFあり" },
    { on: flags.photo, label: "📷 写真あり" },
    { on: flags.plc, label: "⚙ PLCテンプレあり" },
    { on: flags.print3d, label: "🖨 3DPrintあり" },
    { on: flags.qnap, label: "📁 QNAP保存先あり" },
    { on: flags.project, label: "📋 関連案件あり" },
  ];
  const visible = onlyOn ? items.filter((i) => i.on) : items;
  if (!visible.length) return "";
  return `<div class="flag-row">${visible.map((i) => `<span class="flag-badge on">${i.label}</span>`).join("")}</div>`;
}

export function buildHitActionButtons(hit, flags, detailUrl) {
  const actions = [];
  if (flags.pdf && hit.openUrl) {
    actions.push(`<a href="${escapeHtml(hit.openUrl)}">PDFを見る</a>`);
  }
  if (flags.photo && hit.openUrl) {
    actions.push(`<a href="${escapeHtml(hit.openUrl)}">写真を見る</a>`);
  }
  if (flags.qnap) {
    actions.push(
      `<button type="button" class="qnap-link-btn" data-qnap="${escapeHtml(resolveHitQnapPath(hit))}" data-title="${escapeHtml(hit.title)}">QNAP場所</button>`
    );
  }
  actions.push(`<a class="primary" href="${detailUrl}">詳細</a>`);
  if ((hit.relatedCount ?? 0) > 0 || (hit.tags?.length ?? 0) > 0) {
    actions.push(`<a href="${detailUrl}#related">関連ナレッジ</a>`);
  }
  actions.push(
    `<button type="button" class="used-btn full" data-id="${escapeHtml(hit.id)}" data-kind="${escapeHtml(hit.kind)}" data-title="${escapeHtml(hit.title)}">✓ 使った</button>`
  );
  return actions;
}

export function bindHitCardActions(container, toastFn, onUsed) {
  container.querySelectorAll(".qnap-link-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showQnapModal(btn.getAttribute("data-qnap") || "", btn.getAttribute("data-title") || "", toastFn);
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
      });
    });
  });
}

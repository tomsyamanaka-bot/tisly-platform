import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";

const WORKFLOW_LABELS = {
  surveying: "現場調査中",
  estimate_pending: "見積もり作成待ち",
  estimate_done: "見積もり済み",
  ordered: "受注済み",
  completed: "完了",
};

const MATERIAL_ICONS = {
  camera: "📷",
  lan: "🔌",
  wifi: "📶",
  electrical: "⚡",
  lighting: "💡",
  intercom: "🔔",
  aircon: "❄️",
  other: "📦",
};

const MATERIAL_LABELS = {
  camera: "防犯カメラ",
  lan: "LAN配線",
  wifi: "WiFi",
  electrical: "電気工事",
  lighting: "照明",
  intercom: "インターホン",
  aircon: "エアコン",
  other: "その他",
};

const API = "/api/survey/v1";
let currentProjectId = null;

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function showFriendlyError(elId, message) {
  const el = $(elId);
  el.innerHTML = `<strong>うまくいきませんでした</strong>もう一度「保存する」ボタンを押してください。<br><small>${escapeHtml(message)}</small>`;
  el.classList.remove("hidden");
}

async function api(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function showView(name) {
  $("view-list").classList.toggle("hidden", name !== "list");
  $("view-form").classList.toggle("hidden", name !== "form");
  $("view-detail").classList.toggle("hidden", name !== "detail");
  $("view-edit").classList.toggle("hidden", name !== "edit");
  $("btn-back").classList.toggle("hidden", name === "list");
  const titles = {
    list: "現調",
    form: "新しい現調",
    detail: "現調の内容",
    edit: "お客様情報",
  };
  $("page-title").textContent = titles[name] || "現調";
  const hints = {
    list: "お客様の現場を見に行く記録を残します",
    form: "まずはお名前だけ入れれば大丈夫です",
    detail: "写真・部材・メモを確認して、見積へ送れます",
    edit: "お客様の連絡先などを直せます",
  };
  $("page-hint").textContent = hints[name] || "";
}

function statusBadgeClass(status) {
  if (status === "estimate_pending") return "status-badge orange";
  if (status === "estimate_done" || status === "ordered" || status === "completed")
    return "status-badge done";
  return "status-badge green";
}

function renderProjectList(projects) {
  const el = $("project-list");
  if (!projects.length) {
    el.className = "empty-state";
    el.innerHTML =
      '<div class="empty-icon">📋</div><p>まだ案件がありません</p><p>「＋ 新しい現調をはじめる」から作れます</p>';
    return;
  }
  el.className = "";
  el.innerHTML = projects
    .map(
      (p) => `
    <div class="friendly-card list-card" data-id="${p.projectId}">
      <span class="${statusBadgeClass(p.workflowStatus)}">${WORKFLOW_LABELS[p.workflowStatus] || p.workflowStatus}</span>
      <h2>${escapeHtml(p.customerName || p.siteName)}</h2>
      <p>${escapeHtml(p.projectNo || p.projectId)} · ${escapeHtml(p.surveyDate || "日付未設定")}</p>
      <p>${escapeHtml(p.address || "")}</p>
    </div>`
    )
    .join("");
  el.querySelectorAll(".list-card").forEach((node) => {
    node.addEventListener("click", () => openDetail(node.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadList() {
  const code = customerCodeFromPath();
  try {
    const data = await api(`/projects?customerCode=${encodeURIComponent(code)}`);
    renderProjectList(data.projects || []);
  } catch (e) {
    $("project-list").innerHTML = `<div class="error-friendly"><strong>一覧を読み込めませんでした</strong>画面を下に引っ張って更新するか、もう一度開き直してください。<br><small>${escapeHtml(e.message)}</small></div>`;
  }
}

function fillMaterialSelect() {
  const sel = $("material-category");
  sel.innerHTML = Object.entries(MATERIAL_LABELS)
    .map(([k, v]) => `<option value="${k}">${MATERIAL_ICONS[k] || ""} ${v}</option>`)
    .join("");
}

function renderPhotos(photos) {
  const el = $("photo-list");
  if (!photos?.length) {
    el.innerHTML = '<p style="color:var(--tisly-muted);font-size:0.9rem;">まだ写真がありません</p>';
    return;
  }
  el.innerHTML = `<div class="photo-grid">${photos
    .map((ph) => {
      const img = ph.url
        ? `<img src="${ph.url}" alt="" loading="lazy" />`
        : '<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:#eee;font-size:2rem;">📝</div>';
      return `<div class="photo-card">${img}<div class="photo-caption">${escapeHtml(ph.comment || "（説明なし）")}<br><small>${escapeHtml(ph.takenAt || ph.createdAt || "")}</small></div></div>`;
    })
    .join("")}</div>`;
}

function renderMaterials(materials) {
  const el = $("material-list");
  if (!materials?.length) {
    el.innerHTML = '<p style="color:var(--tisly-muted);font-size:0.9rem;">まだ部材がありません</p>';
    return;
  }
  el.innerHTML = materials
    .map(
      (m) =>
        `<div class="material-card">
          <span class="material-icon">${MATERIAL_ICONS[m.category] || "📦"}</span>
          <div>
            <strong>${escapeHtml(MATERIAL_LABELS[m.category] || m.category)}</strong> × ${m.quantity}<br>
            <span>${escapeHtml(m.itemLabel || "")}</span>
            ${m.memo ? `<br><small style="color:var(--tisly-muted)">${escapeHtml(m.memo)}</small>` : ""}
          </div>
        </div>`
    )
    .join("");
}

async function openDetail(projectId) {
  currentProjectId = projectId;
  showView("detail");
  try {
    const p = await api(`/projects/${projectId}`);
    $("detail-name").textContent = p.customerName || p.siteName;
    const statusEl = $("detail-status");
    statusEl.textContent = WORKFLOW_LABELS[p.workflowStatus] || p.workflowStatus;
    statusEl.className = statusBadgeClass(p.workflowStatus);
    $("detail-meta").innerHTML = [
      p.projectNo,
      p.assignee && `担当: ${escapeHtml(p.assignee)}`,
      p.phone,
      p.address,
      p.surveyDate && `現調日: ${p.surveyDate}`,
    ]
      .filter(Boolean)
      .map((x) => escapeHtml(x))
      .join(" · ");
    const notesEl = $("detail-notes");
    if (p.notes) {
      notesEl.textContent = `📝 ${p.notes}`;
      notesEl.classList.remove("hidden");
    } else {
      notesEl.classList.add("hidden");
    }
    renderPhotos(p.photos);
    renderMaterials(p.materials);
    const handoffBtn = $("btn-handoff");
    const handoffInfo = $("handoff-info");
    if (p.workflowStatus === "estimate_pending" || p.handoff) {
      handoffBtn.disabled = true;
      handoffBtn.textContent = "見積もり作成待ち（送り済み）";
      handoffInfo.classList.remove("hidden");
      handoffInfo.innerHTML = p.handoff
        ? `送った日時: ${escapeHtml(p.handoff.handoffAt)} · <a href="/estimate-v1">見積アプリで開く</a>`
        : "";
    } else {
      handoffBtn.disabled = false;
      handoffBtn.textContent = "見積へ送る";
      handoffInfo.classList.add("hidden");
    }
  } catch (e) {
    toast(e.message);
    showView("list");
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const b64 = String(dataUrl).split(",")[1];
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  fillMaterialSelect();
  showView("list");
  await loadList();

  $("btn-new").addEventListener("click", () => {
    currentProjectId = null;
    $("project-form").reset();
    $("form-error").classList.add("hidden");
    showView("form");
  });

  $("btn-back").addEventListener("click", () => {
    if (!$("view-edit").classList.contains("hidden") && currentProjectId) {
      openDetail(currentProjectId);
      return;
    }
    if (!$("view-detail").classList.contains("hidden")) {
      showView("list");
      loadList();
      return;
    }
    showView("list");
  });

  $("project-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const body = {
      customerCode: customerCodeFromPath(),
      customerName: fd.get("customerName"),
      address: fd.get("address") || undefined,
      surveyDate: fd.get("surveyDate") || undefined,
      notes: fd.get("notes") || undefined,
    };
    try {
      const created = await api("/projects", { method: "POST", body: JSON.stringify(body) });
      toast("保存しました");
      await openDetail(created.projectId);
    } catch (e) {
      showFriendlyError("form-error", e.message);
    }
  });

  $("btn-camera").addEventListener("click", () => $("file-input").click());

  $("file-input").addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file || !currentProjectId) return;
    try {
      const imageBase64 = await fileToBase64(file);
      await api(`/projects/${currentProjectId}/photos`, {
        method: "POST",
        body: JSON.stringify({
          comment: $("photo-comment").value || undefined,
          imageBase64,
          fileName: file.name,
          takenAt: new Date().toISOString(),
        }),
      });
      $("photo-comment").value = "";
      ev.target.value = "";
      toast("写真を追加しました");
      await openDetail(currentProjectId);
    } catch (e) {
      toast(e.message);
    }
  });

  $("btn-photo-memo").addEventListener("click", async () => {
    if (!currentProjectId) return;
    const comment = $("photo-comment").value.trim();
    if (!comment) {
      toast("メモの内容を入力してください");
      return;
    }
    try {
      await api(`/projects/${currentProjectId}/photos`, {
        method: "POST",
        body: JSON.stringify({ comment, takenAt: new Date().toISOString() }),
      });
      $("photo-comment").value = "";
      toast("メモを追加しました");
      await openDetail(currentProjectId);
    } catch (e) {
      toast(e.message);
    }
  });

  $("btn-add-material").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      await api(`/projects/${currentProjectId}/materials`, {
        method: "POST",
        body: JSON.stringify({
          category: $("material-category").value,
          itemLabel: $("material-label").value,
          quantity: Number($("material-qty").value) || 1,
          memo: $("material-memo").value,
        }),
      });
      $("material-label").value = "";
      $("material-memo").value = "";
      $("material-qty").value = "1";
      toast("部材を追加しました");
      await openDetail(currentProjectId);
    } catch (e) {
      toast(e.message);
    }
  });

  $("btn-edit").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const p = await api(`/projects/${currentProjectId}`);
      const form = $("edit-form");
      form.customerName.value = p.customerName || "";
      form.address.value = p.address || "";
      form.phone.value = p.phone || "";
      form.email.value = p.email || "";
      form.surveyDate.value = p.surveyDate || "";
      form.assignee.value = p.assignee || "";
      form.notes.value = p.notes || "";
      $("edit-error").classList.add("hidden");
      showView("edit");
    } catch (e) {
      toast(e.message);
    }
  });

  $("edit-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!currentProjectId) return;
    const fd = new FormData(ev.target);
    try {
      await api(`/projects/${currentProjectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          customerName: fd.get("customerName"),
          address: fd.get("address") || undefined,
          phone: fd.get("phone") || undefined,
          email: fd.get("email") || undefined,
          surveyDate: fd.get("surveyDate") || undefined,
          assignee: fd.get("assignee") || undefined,
          notes: fd.get("notes") || undefined,
        }),
      });
      toast("変更を保存しました");
      await openDetail(currentProjectId);
    } catch (e) {
      showFriendlyError("edit-error", e.message);
    }
  });

  $("btn-handoff").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積アプリに送りますか？\n送ったあとは見積担当が料金をまとめます。")) return;
    try {
      await api(`/projects/${currentProjectId}/estimate-pending`, { method: "POST", body: "{}" });
      toast("見積へ送りました");
      await openDetail(currentProjectId);
    } catch (e) {
      toast(e.message);
    }
  });
}

init().catch((e) => {
  console.error(e);
  $("project-list").innerHTML = `<div class="error-friendly"><strong>起動できませんでした</strong>ログインし直してください。<br><small>${escapeHtml(e.message)}</small></div>`;
});

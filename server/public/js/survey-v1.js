import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";

const WORKFLOW_LABELS = {
  surveying: "現調中",
  estimate_pending: "見積待ち",
  estimate_done: "見積済",
  ordered: "受注",
  completed: "完了",
};

const MATERIAL_LABELS = {
  camera: "防犯カメラ",
  lan: "LAN",
  wifi: "WiFi",
  electrical: "電気",
  lighting: "照明",
  intercom: "インターホン",
  aircon: "エアコン",
  other: "その他",
};

const API = "/api/survey/v1";
let currentProjectId = null;
let pendingFile = null;

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
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
  $("btn-back").classList.toggle("hidden", name === "list");
  const titles = { list: "現調案件", form: "新規案件", detail: "案件詳細" };
  $("page-title").textContent = titles[name] || "現調案件";
}

function badgeClass(status) {
  if (status === "estimate_pending") return "badge pending";
  if (status === "estimate_done" || status === "ordered" || status === "completed") return "badge done";
  return "badge";
}

function renderProjectList(projects) {
  const el = $("project-list");
  if (!projects.length) {
    el.className = "empty";
    el.innerHTML = "<p>案件がありません</p><p>「＋ 新規現調案件」から作成してください</p>";
    return;
  }
  el.className = "";
  el.innerHTML = projects
    .map(
      (p) => `
    <div class="card list-item" data-id="${p.projectId}">
      <span class="${badgeClass(p.workflowStatus)}">${WORKFLOW_LABELS[p.workflowStatus] || p.workflowStatus}</span>
      <h2>${escapeHtml(p.customerName || p.siteName)}</h2>
      <p>${escapeHtml(p.projectNo || p.projectId)} · ${escapeHtml(p.surveyDate || "日付未設定")}</p>
      <p>${escapeHtml(p.address || "")}</p>
    </div>`
    )
    .join("");
  el.querySelectorAll(".list-item").forEach((node) => {
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
    $("project-list").innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
  }
}

function fillMaterialSelect() {
  const sel = $("material-category");
  sel.innerHTML = Object.entries(MATERIAL_LABELS)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join("");
}

function renderPhotos(photos) {
  const el = $("photo-list");
  if (!photos?.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">写真メモなし</p>';
    return;
  }
  el.innerHTML = photos
    .map((ph) => {
      const img = ph.url
        ? `<img class="photo-thumb" src="${ph.url}" alt="" loading="lazy" />`
        : '<div class="photo-thumb" style="display:flex;align-items:center;justify-content:center;background:#f0f0f0;font-size:0.7rem;">メモ</div>';
      return `<div class="photo-row">${img}<div><div>${escapeHtml(ph.comment || "（コメントなし）")}</div><div style="color:var(--muted);font-size:0.8rem;">${escapeHtml(ph.takenAt || ph.createdAt || "")}</div></div></div>`;
    })
    .join("");
}

function renderMaterials(materials) {
  const el = $("material-list");
  if (!materials?.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">部材未登録</p>';
    return;
  }
  el.innerHTML = materials
    .map(
      (m) =>
        `<div class="material-row"><div><strong>${escapeHtml(MATERIAL_LABELS[m.category] || m.category)}</strong> × ${m.quantity}<br>${escapeHtml(m.itemLabel || "")} ${m.memo ? `<span style="color:var(--muted)">(${escapeHtml(m.memo)})</span>` : ""}</div></div>`
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
    statusEl.className = badgeClass(p.workflowStatus);
    $("detail-meta").innerHTML = [
      p.projectNo,
      p.assignee && `担当: ${escapeHtml(p.assignee)}`,
      p.phone,
      p.email,
      p.address,
      p.surveyDate && `現調日: ${p.surveyDate}`,
    ]
      .filter(Boolean)
      .map((x) => escapeHtml(x))
      .join(" · ");
    const notesEl = $("detail-notes");
    if (p.notes) {
      notesEl.textContent = p.notes;
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
      handoffBtn.textContent = "見積待ち（引き渡し済）";
      handoffInfo.classList.remove("hidden");
      handoffInfo.textContent = p.handoff
        ? `引き渡し: ${p.handoff.handoffAt}`
        : "見積PWA連携は次フェーズで実装予定";
    } else {
      handoffBtn.disabled = false;
      handoffBtn.textContent = "見積へ渡す";
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
    if ($("view-detail").classList.contains("hidden") === false) {
      showView("list");
      loadList();
    } else {
      showView("list");
    }
  });

  $("project-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const body = {
      customerCode: customerCodeFromPath(),
      customerName: fd.get("customerName"),
      address: fd.get("address") || undefined,
      phone: fd.get("phone") || undefined,
      email: fd.get("email") || undefined,
      surveyDate: fd.get("surveyDate") || undefined,
      assignee: fd.get("assignee") || undefined,
      notes: fd.get("notes") || undefined,
    };
    try {
      const created = await api("/projects", { method: "POST", body: JSON.stringify(body) });
      toast("案件を作成しました");
      await openDetail(created.projectId);
    } catch (e) {
      const err = $("form-error");
      err.textContent = e.message;
      err.classList.remove("hidden");
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
      toast("写真を登録しました");
      await openDetail(currentProjectId);
    } catch (e) {
      toast(e.message);
    }
  });

  $("btn-photo-memo").addEventListener("click", async () => {
    if (!currentProjectId) return;
    const comment = $("photo-comment").value.trim();
    if (!comment) {
      toast("コメントを入力してください");
      return;
    }
    try {
      await api(`/projects/${currentProjectId}/photos`, {
        method: "POST",
        body: JSON.stringify({ comment, takenAt: new Date().toISOString() }),
      });
      $("photo-comment").value = "";
      toast("メモを登録しました");
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

  $("btn-handoff").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積へ渡しますか？（workflow_status → 見積待ち）")) return;
    try {
      await api(`/projects/${currentProjectId}/estimate-pending`, { method: "POST", body: "{}" });
      toast("見積待ちに変更しました");
      await openDetail(currentProjectId);
    } catch (e) {
      toast(e.message);
    }
  });
}

init().catch((e) => {
  console.error(e);
  $("project-list").innerHTML = `<p class="error">初期化エラー: ${escapeHtml(e.message)}</p>`;
});

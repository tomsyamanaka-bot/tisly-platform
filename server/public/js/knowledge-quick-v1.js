import { initPracticalNav } from "./tisly-practical-nav.js";
import { requireCustomerLogin } from "./customer-auth.js";

const QUICK_TAGS = ["PoE給電", "RJ45", "ラック", "盤内配線", "RP2350", "PLC", "防犯カメラ", "LAN"];

const $ = (id) => document.getElementById(id);
let imageBase64 = "";
let selectedTags = new Set();

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3500);
}

async function api(path, opts = {}) {
  const token =
    localStorage.getItem("tisly_admin_token") || sessionStorage.getItem("tisly_token") || "";
  const res = await fetch(`/api/knowledge${path}`, {
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

function renderTagChips() {
  const mount = $("tag-chips");
  if (!mount) return;
  mount.innerHTML = QUICK_TAGS.map(
    (t) =>
      `<button type="button" class="tag-chip-btn${selectedTags.has(t) ? " active" : ""}" data-tag="${t}">${t}</button>`
  ).join("");
  mount.querySelectorAll("[data-tag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.getAttribute("data-tag");
      if (selectedTags.has(tag)) selectedTags.delete(tag);
      else selectedTags.add(tag);
      renderTagChips();
    });
  });
}

async function loadCategories() {
  const data = await api("/categories");
  const sel = $("quick-category");
  if (!sel) return;
  sel.innerHTML = (data.categories || [])
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
}

async function init() {
  await requireCustomerLogin();
  initPracticalNav({ title: "＋ナレッジ", active: "settings" });
  await loadCategories();
  renderTagChips();

  $("quick-photo")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      imageBase64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      const preview = $("photo-preview");
      if (preview) {
        preview.src = dataUrl;
        preview.classList.remove("hidden");
      }
    };
    reader.readAsDataURL(file);
  });

  $("quick-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const t0 = Date.now();
    try {
      const { card } = await api("/quick", {
        method: "POST",
        body: JSON.stringify({
          title: $("quick-title")?.value?.trim() || "現場メモ",
          category: $("quick-category")?.value || "その他",
          tags: [...selectedTags],
          memo: $("quick-memo")?.value?.trim() || "",
          imageBase64: imageBase64 || undefined,
          fileName: $("quick-photo")?.files?.[0]?.name,
        }),
      });
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      toast(`✅ 保存 ${card.id}（${sec}秒）`);
      $("quick-form")?.reset();
      imageBase64 = "";
      selectedTags.clear();
      renderTagChips();
      $("photo-preview")?.classList.add("hidden");
    } catch (err) {
      toast(err.message || "保存失敗");
    }
  });
}

init().catch((e) => {
  console.error(e);
  toast(e.message || "初期化失敗");
});

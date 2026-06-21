/**
 * TiSLY Monitoring mapAsset Manager V3.1
 */
const params = new URLSearchParams(location.search);
const siteId = params.get("siteId") || "DEMO-HOME-001";

const $ = (sel) => document.querySelector(sel);

let listData = null;
let selectedAssetId = null;

function api(path, opts = {}) {
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || String(r.status));
    return body;
  });
}

function showMsg(el, text, isError = false) {
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function renderGuide(guide) {
  const box = $("#mma-upload-guide");
  if (!box || !guide) return;
  box.innerHTML = `
    <p><strong>対象:</strong> ${guide.audience}</p>
    <p><strong>Polycam:</strong> ${guide.polycam}</p>
    <p><strong>RoomPlan:</strong> ${guide.roomplan}</p>
    <p><strong>Scaniverse:</strong> ${guide.scaniverse}</p>
    <p><strong>フロア分割:</strong> ${guide.floorSplit}</p>
    <p><strong>位置合わせ:</strong> ${guide.calibration}</p>
    <p><strong>将来保存:</strong> ${guide.futureStorage}</p>
  `;
}

function fillTransformForm(asset) {
  const t = asset.transform;
  $("#mma-t-x").value = t.position.x;
  $("#mma-t-y").value = t.position.y;
  $("#mma-t-z").value = t.position.z;
  $("#mma-t-rx").value = t.rotation.x;
  $("#mma-t-ry").value = t.rotation.y;
  $("#mma-t-rz").value = t.rotation.z;
  $("#mma-t-sx").value = t.scale.x;
  $("#mma-t-sy").value = t.scale.y;
  $("#mma-t-sz").value = t.scale.z;
  $("#mma-t-ho").value = t.heightOffset ?? 0;
  $("#mma-cal-title").textContent = `${asset.title} (${asset.assetId})`;
  $("#mma-calibration-panel").hidden = false;
  const preview = $("#mma-btn-preview-3d");
  if (preview) preview.href = `/monitoring-3d-v2?siteId=${encodeURIComponent(siteId)}`;
}

function renderAssets(data) {
  const list = $("#mma-asset-list");
  if (!list) return;

  if (!data.assets.length) {
    list.innerHTML = `<p class="mma-muted">登録なし — fallback: ${data.fallbackAsset?.title ?? "—"}</p>`;
    return;
  }

  list.innerHTML = data.assets
    .map((a) => {
      const isActive = data.activeAsset?.assetId === a.assetId;
      return `<article class="mma-asset-card${isActive ? " is-active" : ""}" data-id="${a.assetId}">
        <header>
          <div class="mma-card-row">
            <img class="mma-preview" src="${a.previewUrl || "/icons/icon-128.png"}" alt="" width="64" height="64" />
            <div>
              <h3>${escapeHtml(a.title)}</h3>
              <p class="mma-meta">${a.sourceType} · ${a.fileType} · ${a.floorLevel} · ${a.mapType}</p>
            </div>
          </div>
          <span class="mma-badge${isActive ? " active" : ""}">${isActive ? "ACTIVE" : a.status}</span>
        </header>
        <p class="mma-meta">${escapeHtml(a.notes || "")}${a.fileUrl ? "" : " · fileUrl 未接続（placeholder）"}</p>
        <div class="mma-actions">
          <button type="button" class="mma-btn secondary mma-set-active" data-id="${a.assetId}">active</button>
          <button type="button" class="mma-btn secondary mma-edit-transform" data-id="${a.assetId}">transform</button>
        </div>
      </article>`;
    })
    .join("");

  list.querySelectorAll(".mma-set-active").forEach((btn) => {
    btn.addEventListener("click", () => setActive(btn.dataset.id));
  });
  list.querySelectorAll(".mma-edit-transform").forEach((btn) => {
    btn.addEventListener("click", () => {
      const asset = data.assets.find((a) => a.assetId === btn.dataset.id);
      if (asset) {
        selectedAssetId = asset.assetId;
        fillTransformForm(asset);
      }
    });
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
  listData = await api(`/api/monitoring/v1/map-assets?siteId=${encodeURIComponent(siteId)}`);
  renderAssets(listData);
  renderGuide(listData.uploadGuide);
}

async function setActive(assetId) {
  await api(`/api/monitoring/v1/map-assets/${encodeURIComponent(assetId)}?siteId=${encodeURIComponent(siteId)}`, {
    method: "PATCH",
    body: JSON.stringify({ setActive: true }),
  });
  await loadList();
}

async function saveTransform() {
  if (!selectedAssetId) return;
  const msg = $("#mma-cal-msg");
  try {
    await api(`/api/monitoring/v1/map-assets/${encodeURIComponent(selectedAssetId)}?siteId=${encodeURIComponent(siteId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        transform: {
          position: {
            x: Number($("#mma-t-x").value),
            y: Number($("#mma-t-y").value),
            z: Number($("#mma-t-z").value),
          },
          rotation: {
            x: Number($("#mma-t-rx").value),
            y: Number($("#mma-t-ry").value),
            z: Number($("#mma-t-rz").value),
          },
          scale: {
            x: Number($("#mma-t-sx").value),
            y: Number($("#mma-t-sy").value),
            z: Number($("#mma-t-sz").value),
          },
          heightOffset: Number($("#mma-t-ho").value),
        },
      }),
    });
    showMsg(msg, "transform を保存しました — 3Dプレビューで確認してください");
    await loadList();
  } catch (e) {
    showMsg(msg, e.message, true);
  }
}

async function resetTransform() {
  if (!selectedAssetId) return;
  const msg = $("#mma-cal-msg");
  try {
    await api(`/api/monitoring/v1/map-assets/${encodeURIComponent(selectedAssetId)}?siteId=${encodeURIComponent(siteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ resetTransform: true }),
    });
    showMsg(msg, "transform をリセットしました");
    await loadList();
    const asset = listData.assets.find((a) => a.assetId === selectedAssetId);
    if (asset) fillTransformForm(asset);
  } catch (e) {
    showMsg(msg, e.message, true);
  }
}

function bindUi() {
  $("#mma-site-label").textContent = `siteId: ${siteId}`;
  $("#mma-link-3d").href = `/monitoring-3d-v2?siteId=${encodeURIComponent(siteId)}`;
  $("#mma-btn-reload")?.addEventListener("click", () => loadList().catch(console.error));

  $("#mma-upload-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#mma-upload-msg");
    const fd = new FormData(e.target);
    try {
      await api("/api/monitoring/v1/map-assets", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          title: fd.get("title"),
          sourceType: fd.get("sourceType"),
          fileType: fd.get("fileType"),
          fileName: fd.get("fileName"),
          floorLevel: fd.get("floorLevel"),
          mapType: fd.get("mapType"),
          notes: fd.get("notes"),
          setActive: fd.get("setActive") === "on",
          previewUrl: "/icons/icon-128.png",
          fileUrl: "",
        }),
      });
      showMsg(msg, "登録しました");
      e.target.reset();
      await loadList();
    } catch (err) {
      showMsg(msg, err.message, true);
    }
  });

  $("#mma-btn-save-transform")?.addEventListener("click", saveTransform);
  $("#mma-btn-reset-transform")?.addEventListener("click", resetTransform);
}

bindUi();
loadList().catch((err) => {
  console.error(err);
  showMsg($("#mma-upload-msg"), "読み込み失敗", true);
});

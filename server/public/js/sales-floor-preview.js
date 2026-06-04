const STATUS_CLASS = { ONLINE: "pin-online", WARNING: "pin-warning", OFFLINE: "pin-offline" };

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function pinLabel(pin) {
  const typeJa = {
    camera: "カメラ",
    beam: "ビーム",
    pir: "人感",
    door: "ドア",
    esp: "通信機",
    shelly: "照明制御",
    light: "照明",
  };
  return pin.label || typeJa[pin.pinType] || pin.pinType;
}

function renderLayer(layer) {
  const section = document.createElement("section");
  section.className = "floor-layer";
  section.id = `layer-${layer.tier}`;
  section.dataset.tier = layer.tier;

  const title = document.createElement("h2");
  title.textContent = layer.displayName;
  section.appendChild(title);

  const wrap = document.createElement("div");
  wrap.className = "floor-map-wrap";

  const img = document.createElement("img");
  img.src = layer.imageUrl;
  img.alt = layer.displayName;
  img.className = "floor-map-img";
  wrap.appendChild(img);

  for (const pin of layer.pins) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `floor-pin ${STATUS_CLASS[pin.status] ?? "pin-offline"}`;
    dot.style.left = `${pin.posX * 100}%`;
    dot.style.top = `${pin.posY * 100}%`;
    dot.title = `${pinLabel(pin)} — ${pin.status}`;
    dot.setAttribute("aria-label", pinLabel(pin));
    dot.innerHTML = `<span class="pin-dot"></span><span class="pin-lbl">${pinLabel(pin)}</span>`;
    wrap.appendChild(dot);
  }

  section.appendChild(wrap);

  const legend = document.createElement("p");
  legend.className = "layer-legend";
  legend.textContent = `設備 ${layer.pins.length} 点 · 緑=正常 / 黄=注意 / 赤=つながらない`;
  section.appendChild(legend);

  return section;
}

function scrollToTier(tier) {
  const el = document.getElementById(`layer-${tier}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadPreview() {
  const customer = (qs("customer") || "TOMS001").toUpperCase();
  const scrollTo = qs("scrollTo");

  const statusEl = document.getElementById("preview-status");
  const root = document.getElementById("floor-stack");
  root.innerHTML = "";

  try {
    const data = await fetch(`/api/demo-kit/floor-preview-live/${customer}`).then((r) => {
      if (!r.ok) throw new Error("図面の読み込みに失敗しました");
      return r.json();
    });

    document.getElementById("preview-title").textContent = `${data.customerName} — 建物の見取り図`;
    statusEl.textContent = data.alert?.tier
      ? `いま注意が必要なのは「${data.layers.find((l) => l.tier === data.alert.tier)?.displayName ?? data.alert.tier}」です`
      : "すべての設備は正常です（デモ）";

    for (const layer of data.layers) {
      root.appendChild(renderLayer(layer));
    }

    const target = scrollTo || data.alert?.tier;
    if (target) {
      requestAnimationFrame(() => scrollToTier(target));
    }
  } catch (e) {
    statusEl.textContent = e.message;
  }
}

document.getElementById("btn-refresh")?.addEventListener("click", loadPreview);
document.getElementById("btn-intrusion")?.addEventListener("click", async () => {
  const customer = (qs("customer") || "TOMS001").toUpperCase();
  await fetch("/api/demo-kit/notifications/intrusion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerCode: customer }),
  });
  await loadPreview();
});

loadPreview();
setInterval(() => loadPreview().catch(() => {}), 15000);

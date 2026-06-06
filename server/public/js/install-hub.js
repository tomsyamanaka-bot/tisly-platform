import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";
let activeSessionId = sessionStorage.getItem("tisly_install_session") || "";

function customerCode() {
  return document.getElementById("install-customer")?.value || "TOMS001";
}

function headers(json = false) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function updateLinks() {
  const code = customerCode();
  document.getElementById("link-install-home").href = `/customer/${code}/install/home`;
  document.getElementById("link-device-onboard").href = `/customer/${code}/install/device-onboard`;
}

function updateSessionUi() {
  const el = document.getElementById("install-session-status");
  const completeBtn = document.getElementById("btn-install-complete");
  if (activeSessionId) {
    el.textContent = `作業中 — セッション ${activeSessionId}`;
    completeBtn.disabled = false;
  } else {
    el.textContent = "未開始";
    completeBtn.disabled = true;
  }
}

async function startSession() {
  const code = customerCode();
  const res = await fetch(`/api/customer/${code}/install/session/start`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ mode: "live" }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  activeSessionId = data.id;
  sessionStorage.setItem("tisly_install_session", activeSessionId);
  updateSessionUi();
}

async function completeSession() {
  const code = customerCode();
  const res = await fetch(`/api/customer/${code}/install/session/complete`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ sessionId: activeSessionId }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  activeSessionId = "";
  sessionStorage.removeItem("tisly_install_session");
  updateSessionUi();
  alert("作業完了を記録しました");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function isAllowedPhoto(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return ext === "jpg" || ext === "jpeg" || ext === "png";
}

async function uploadPhotos() {
  const code = customerCode();
  const files = [...(document.getElementById("install-photos")?.files || [])];
  if (!files.length) {
    alert("写真を選択してください");
    return;
  }
  const invalid = files.filter((f) => !isAllowedPhoto(f));
  if (invalid.length) {
    alert("jpg / png のみアップロードできます");
    return;
  }
  for (const file of files) {
    const b64 = await fileToBase64(file);
    const res = await fetch(`/api/customer/${code}/install/photos/upload`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        imageBase64: b64,
        fileName: file.name,
        photoType: "construction",
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
  }
  document.getElementById("install-photos").value = "";
  alert(`${files.length} 枚を登録しました`);
}

async function lookupQr() {
  const token = document.getElementById("install-qr-input")?.value?.trim();
  if (!token) return;
  const assetId = token.includes("asset/") ? token.split("asset/")[1]?.split("?")[0] : token;
  const res = await fetch(`/api/assets/qr/${assetId}`, { headers: headers() });
  const el = document.getElementById("install-qr-result");
  if (!res.ok) {
    el.textContent = "QR 照会失敗 — ログインまたは ID を確認";
    return;
  }
  const data = await res.json();
  el.innerHTML = `<p>${data.deviceKind} ${data.label} (${data.deviceId})</p>
    <p><a href="${data.qrUrl}">資産詳細</a></p>`;
}

document.getElementById("install-customer")?.addEventListener("change", updateLinks);
document.getElementById("btn-install-start")?.addEventListener("click", () =>
  startSession().catch((e) => alert(e.message))
);
document.getElementById("btn-install-complete")?.addEventListener("click", () =>
  completeSession().catch((e) => alert(e.message))
);
document.getElementById("btn-install-photo")?.addEventListener("click", () =>
  uploadPhotos().catch((e) => alert(e.message))
);
document.getElementById("btn-install-qr")?.addEventListener("click", () =>
  lookupQr().catch((e) => alert(e.message))
);

renderPwaTopbar("installer", "施工");
updateLinks();
updateSessionUi();

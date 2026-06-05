import { apiPut, apiPost } from "./api.js";

const banner = document.getElementById("ready-banner");
const list = document.getElementById("checklist-items");
const codeInput = document.getElementById("customerCode");
const completeBtn = document.getElementById("complete-btn");

async function loadChecklist(code) {
  const q = code ? `?customerCode=${encodeURIComponent(code)}` : "";
  const data = await fetch(`/api/deployment-kit/checklist${q}`).then((r) => r.json());
  if (data.deploymentComplete || data.ready) {
    banner.className = "ready";
    banner.textContent = data.deploymentComplete ? "✓ 導入完了" : "✓ 全項目OK — 導入完了可能";
    completeBtn.style.display = data.ready && !data.deploymentComplete ? "inline-block" : "none";
  } else {
    banner.className = "pending";
    banner.textContent = "未完了項目あり";
    completeBtn.style.display = "none";
  }
  let html = data.items
    .map(
      (i) => `<li>
        <span class="${i.ok ? "ok" : "ng"}">${i.ok ? "✓" : "—"}</span> ${i.label}
        <small>${i.detail}</small>
        ${code ? `<button type="button" data-id="${i.id}" data-ok="${!i.ok}">${i.ok ? "NGにする" : "OKにする"}</button>` : ""}
      </li>`
    )
    .join("");
  try {
    const sb = await fetch("/api/deploy/switchbot-checklist").then((r) => r.json());
    if (sb.items?.length) {
      html += `<li><strong>SwitchBot / Security Automation（Phase 1321–1340）</strong></li>`;
      html += sb.items
        .map(
          (i) =>
            `<li><span class="${i.ok ? "ok" : "ng"}">${i.ok ? "✓" : "—"}</span> ${i.label}<small>${i.detail}</small></li>`
        )
        .join("");
    }
  } catch {
    /* optional */
  }
  list.innerHTML = html;
  list.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await apiPut(`/api/deployment-kit/checklist/${code}/${btn.dataset.id}`, {
        ok: btn.dataset.ok === "true",
      });
      loadChecklist(code);
    });
  });
}

document.getElementById("load-btn").addEventListener("click", () => {
  const code = codeInput.value.trim();
  if (code) loadChecklist(code).catch(console.error);
});

completeBtn.addEventListener("click", async () => {
  const code = codeInput.value.trim();
  try {
    await apiPost(`/api/deployment-kit/checklist/${code}/complete`, {});
    loadChecklist(code);
  } catch (err) {
    alert(String(err.message ?? err));
  }
});

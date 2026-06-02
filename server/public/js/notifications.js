import { apiGet, apiPatch, apiPost } from "./api.js";

let searchDebounce;

async function loadNotifications() {
  const unread = document.getElementById("filter-unread").checked;
  const readOnly = document.getElementById("filter-read").checked;
  const eventType = document.getElementById("filter-event").value;
  const q = document.getElementById("filter-search").value.trim();
  let query = `/api/notifications?limit=200`;
  if (unread) query += "&unread=true";
  if (readOnly) query += "&read=true";
  if (eventType) query += `&eventType=${encodeURIComponent(eventType)}`;
  if (q) query += `&q=${encodeURIComponent(q)}`;
  const data = await apiGet(query);
  const tbody = document.getElementById("notif-body");
  tbody.innerHTML = (data.notifications ?? [])
    .map((n) => {
      const unreadCls = n.read_at ? "" : "unread";
      const statusCls = n.status === "sent" ? "sent" : "failed";
      const readLabel = n.read_at ? "既読" : "未読";
      return `<tr class="${unreadCls}">
        <td>${n.created_at}</td>
        <td>${n.channel}</td>
        <td>${n.event_type}</td>
        <td>${n.title}</td>
        <td><span class="badge ${statusCls}">${readLabel}</span></td>
        <td>
          ${n.read_at ? "" : `<button class="btn secondary btn-read" data-id="${n.id}">既読</button>`}
          ${n.status === "failed" ? `<button class="btn secondary btn-resend" data-id="${n.id}">再送</button>` : ""}
        </td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".btn-read").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await apiPatch(`/api/notifications/${btn.dataset.id}/read`);
      loadNotifications();
    });
  });
  tbody.querySelectorAll(".btn-resend").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await apiPost(`/api/notifications/${btn.dataset.id}/resend`);
      loadNotifications();
    });
  });
}

document.getElementById("filter-unread").addEventListener("change", loadNotifications);
document.getElementById("filter-read").addEventListener("change", loadNotifications);
document.getElementById("filter-event").addEventListener("change", loadNotifications);
document.getElementById("btn-refresh").addEventListener("click", loadNotifications);
document.getElementById("filter-search").addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadNotifications, 300);
});
document.getElementById("btn-read-all")?.addEventListener("click", async () => {
  await apiPost("/api/notifications/read-all");
  loadNotifications();
});
loadNotifications().catch(console.error);

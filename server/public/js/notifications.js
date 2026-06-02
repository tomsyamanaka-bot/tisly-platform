import { apiGet, apiPatch, apiPost } from "./api.js";

async function loadNotifications() {
  const unread = document.getElementById("filter-unread").checked;
  const eventType = document.getElementById("filter-event").value;
  let q = `/api/notifications?limit=200`;
  if (unread) q += "&unread=true";
  if (eventType) q += `&eventType=${encodeURIComponent(eventType)}`;
  const data = await apiGet(q);
  const tbody = document.getElementById("notif-body");
  tbody.innerHTML = (data.notifications ?? [])
    .map((n) => {
      const unreadCls = n.read_at ? "" : "unread";
      const statusCls = n.status === "sent" ? "sent" : "failed";
      return `<tr class="${unreadCls}">
        <td>${n.created_at}</td>
        <td>${n.channel}</td>
        <td>${n.event_type}</td>
        <td>${n.title}</td>
        <td><span class="badge ${statusCls}">${n.status}</span></td>
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
document.getElementById("filter-event").addEventListener("change", loadNotifications);
document.getElementById("btn-refresh").addEventListener("click", loadNotifications);
loadNotifications().catch(console.error);

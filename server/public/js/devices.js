async function loadDevices() {
  const customer = document.getElementById("customer-filter")?.value ?? "";
  const q = customer ? `?customerCode=${encodeURIComponent(customer)}` : "";
  const res = await fetch(`/api/demo-kit/devices/registry${q}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);

  document.getElementById("device-mode").textContent = data.summary?.deviceMode ?? "—";
  const s = data.summary ?? {};
  document.getElementById("summary").innerHTML = `
    <span>合計 <strong>${s.deviceCount ?? 0}</strong></span>
    <span>ONLINE <strong>${s.onlineCount ?? 0}</strong></span>
    <span>WARNING <strong>${s.warningCount ?? 0}</strong></span>
    <span>OFFLINE <strong>${s.offlineCount ?? 0}</strong></span>
  `;

  const tbody = document.getElementById("device-rows");
  tbody.innerHTML = (data.devices ?? [])
    .map(
      (d) => `<tr>
        <td><code>${d.deviceId}</code></td>
        <td>${d.name}</td>
        <td>${d.kind}</td>
        <td><span class="badge ${d.status}">${d.status}</span></td>
        <td>${d.lastSeen ? new Date(d.lastSeen).toLocaleString("ja-JP") : "—"}</td>
        <td>${d.source}</td>
      </tr>`
    )
    .join("");
}

document.getElementById("btn-refresh")?.addEventListener("click", () => loadDevices().catch(alert));
document.getElementById("customer-filter")?.addEventListener("change", () => loadDevices().catch(alert));
loadDevices().catch(alert);

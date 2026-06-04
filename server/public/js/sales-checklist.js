async function loadChecklist() {
  const res = await fetch("/api/demo-kit/sales/checklist");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);

  const banner = document.getElementById("ready-banner");
  if (banner) {
    if (data.ready) {
      banner.className = "ready";
      banner.textContent = "営業デモ準備完了";
    } else {
      banner.className = "pending";
      banner.textContent = "未完了の項目があります（下記を確認）";
    }
  }

  const ul = document.getElementById("checklist-items");
  if (!ul) return;
  ul.innerHTML = (data.items ?? [])
    .map(
      (item) =>
        `<li><span class="${item.ok ? "ok" : "ng"}">${item.ok ? "OK" : "NG"}</span> ${item.label}<small>${item.detail}</small></li>`
    )
    .join("");
}

loadChecklist().catch((e) => {
  const banner = document.getElementById("ready-banner");
  if (banner) banner.textContent = e.message;
});

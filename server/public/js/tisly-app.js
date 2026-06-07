const SCREENS = {
  home: { title: "Home", description: "TiSLY App — ホーム（準備中）" },
  devices: { title: "Devices", description: "デバイス一覧（準備中）" },
  events: { title: "Events", description: "イベント履歴（準備中）" },
  settings: { title: "Settings", description: "設定（準備中）" },
};

function currentRoute() {
  const path = window.location.pathname.replace(/\/$/, "");
  const match = path.match(/^\/tisly-app(?:\/(\w+))?$/);
  if (!match) return "home";
  return match[1] && SCREENS[match[1]] ? match[1] : "home";
}

function render(route) {
  const screen = SCREENS[route] ?? SCREENS.home;
  document.title = `${screen.title} — TiSLY App`;
  const main = document.getElementById("tisly-main");
  if (main) {
    main.innerHTML = `<h1>${screen.title}</h1><p>${screen.description}</p>`;
  }
  document.querySelectorAll("#tisly-nav a[data-route]").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-route") === route);
  });
}

function init() {
  const route = currentRoute();
  if (window.location.pathname === "/tisly-app" || window.location.pathname === "/tisly-app/") {
    history.replaceState(null, "", "/tisly-app/home");
  }
  render(route);
}

window.addEventListener("popstate", () => render(currentRoute()));
document.getElementById("tisly-nav")?.addEventListener("click", (e) => {
  const link = e.target.closest("a[data-route]");
  if (!link) return;
  e.preventDefault();
  const route = link.getAttribute("data-route");
  history.pushState(null, "", `/tisly-app/${route}`);
  render(route);
});

init();

/** TiSLY Installer PWA — iOS meta helpers, Android beforeinstallprompt, standalone detect */

const pathMatch = location.pathname.match(/\/customer\/([^/]+)/i);
export const installerCustomerCode = pathMatch ? pathMatch[1].toUpperCase() : "";

export function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById("btn-pwa-install")?.removeAttribute("hidden");
  document.getElementById("btn-android-install")?.removeAttribute("hidden");
  document.getElementById("pwa-install-bar")?.removeAttribute("hidden");
});

export async function promptPwaInstall() {
  if (!deferredInstallPrompt) return false;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  return outcome === "accepted";
}

function wireInstallButtons() {
  for (const id of ["btn-pwa-install", "btn-android-install"]) {
    document.getElementById(id)?.addEventListener("click", () => {
      promptPwaInstall().catch(() => {});
    });
  }
}

function wireGuideLinks() {
  const code = installerCustomerCode;
  const installHref = code ? `/customer/${code}/install` : "/install-guide.html";
  const guideHref = code
    ? `/customer/${code}/install/guide`
    : "/install-guide.html";
  const manifest = document.getElementById("installer-manifest");
  if (manifest && code) {
    manifest.href = `/customer/${code}/install/manifest.webmanifest`;
  }
  const linkApp = document.getElementById("link-install-app");
  if (linkApp) linkApp.href = installHref;
  const linkGuide = document.getElementById("link-install-guide");
  if (linkGuide) linkGuide.href = guideHref;
}

function updateStandaloneUi() {
  if (!isStandalonePwa()) return;
  document.getElementById("pwa-install-bar")?.setAttribute("hidden", "");
  document.getElementById("btn-pwa-install")?.setAttribute("hidden", "");
  document.getElementById("btn-android-install")?.setAttribute("hidden", "");
  const hint = document.getElementById("android-standalone-hint");
  if (hint) hint.hidden = false;
}

wireInstallButtons();
wireGuideLinks();
updateStandaloneUi();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}

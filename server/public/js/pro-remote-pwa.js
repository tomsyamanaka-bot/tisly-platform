import { renderPwaTopbar } from "./tisly-pwa-shell.js";
import { requireCustomerLogin, customerCodeFromPath } from "./customer-auth.js";

const m = location.pathname.match(/\/customer\/([^/]+)/i);
const code = m ? m[1].toUpperCase() : customerCodeFromPath();

document.getElementById("pro-remote-customer").textContent = code;
document.getElementById("link-pro-ops").href = `/operations?customer=${code}`;
document.getElementById("link-pro-overview").href = `/customer/${code}/overview`;
document.getElementById("link-pro-health").href = `/customer/${code}/health`;
document.getElementById("link-pro-tv").href = `/tv/${code}`;
document.getElementById("link-operations-full").href = `/operations?customer=${code}`;
document.getElementById("link-back-portal").href = `/customer/${code}`;

const man = document.getElementById("pro-remote-manifest");
if (man) man.href = `/customer/${code}/pro-remote/manifest.webmanifest`;

import { initProRemoteFloorMap } from "./pro-remote-floor-map.js";
import { startProRemoteMqttPolling } from "./pro-remote-mqtt-panel.js";

async function boot() {
  const session = await requireCustomerLogin(code);
  if (!session) return;
  renderPwaTopbar("pro_remote", "監視");
  startProRemoteMqttPolling();
  initProRemoteFloorMap();
}

boot();

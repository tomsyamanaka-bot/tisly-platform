import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const m = location.pathname.match(/\/customer\/([^/]+)/i);
const code = m ? m[1].toUpperCase() : "TOMS001";

document.getElementById("pro-remote-customer").textContent = code;
document.getElementById("link-pro-ops").href = `/operations?customer=${code}`;
document.getElementById("link-pro-overview").href = `/customer/${code}/overview`;
document.getElementById("link-pro-health").href = `/customer/${code}/health`;
document.getElementById("link-pro-tv").href = `/tv/${code}`;
document.getElementById("link-operations-full").href = `/operations?customer=${code}`;

const man = document.getElementById("pro-remote-manifest");
if (man) man.href = `/customer/${code}/pro-remote/manifest.webmanifest`;

import { initProRemoteFloorMap } from "./pro-remote-floor-map.js";

renderPwaTopbar("pro_remote", "監視");
initProRemoteFloorMap();

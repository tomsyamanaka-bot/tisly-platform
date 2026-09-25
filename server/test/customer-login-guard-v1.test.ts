import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../public");

function readPublic(rel: string) {
  return fs.readFileSync(path.join(publicDir, rel), "utf8");
}

describe("customer-login-guard-v1", () => {
  it("hides TiSLY HOME chrome on the /customer login shell", () => {
    const html = readPublic("customer-v1.html");
    assert.match(html, /data-hqs-skip="1"/);
    const js = readPublic("js/customer-v1.js");
    assert.match(js, /clearCustomerChrome\(\)/);
    assert.match(js, /function renderLogin/);
    assert.doesNotMatch(js, /\/api\/customer-portal\/v1\/landing/);
    const css = readPublic("css/customer-v1.css");
    assert.match(css, /body\.customer-v1:not\(\.is-customer-authed\) \.cv-bottom-bar/);
  });

  it("mounts the HOME fab only after a customer session", () => {
    const js = readPublic("js/features/home/home-quick-switch-v1.js");
    assert.match(js, /function hasCustomerSession/);
    assert.match(js, /p === "\/customer"/);
    assert.match(js, /p\.startsWith\("\/customer"\) && !hasCustomerSession\(\)/);
    const css = readPublic("css/features/home/home-quick-switch-v1.css");
    assert.match(css, /body\[data-hqs-skip="1"\] \.hqs-fab/);
  });

  it("redirects unauthenticated customer dashboards to /customer", () => {
    for (const rel of [
      "js/customer-home-v1.js",
      "js/customer-project-v1.js",
      "js/customer-document-v1.js",
      "js/customer-monitoring-v1.js",
      "js/features/home/home-customer-v1.js",
      "js/features/gas-monitor/gas-monitor-customer-v1.js",
      "js/features/demand-security/demand-security-customer-v1.js",
    ]) {
      assert.match(readPublic(rel), /requireCustomerSession/, rel);
    }
    const eco = readPublic("js/features/eco-water/eco-water-v1.js");
    assert.match(eco, /startsWith\("\/customer"\)/);
    assert.match(eco, /requireCustomerSession/);
    const intercom = readPublic("js/features/home/home-intercom-link-v1.js");
    assert.match(intercom, /path\.startsWith\("\/customer"\) && !isLoggedIn\(\)/);
  });
});

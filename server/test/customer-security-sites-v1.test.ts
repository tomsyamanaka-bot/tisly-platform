import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerSecuritySiteLabelV1,
  defaultCustomerSecuritySiteIdV1,
  isCustomerSecuritySiteSelectableV1,
  listCustomerSecuritySitesV1,
} from "../src/shared/customer/customer-security-sites-v1.js";
import { SEC_JP_TOYOSHIMA_SITE_ID_V1 } from "../src/home/home-toyoshima-security-v1.js";
import { SECURITY_FLOOR_ITABASHI_LIVE_SITE_ID_V1 } from "../src/security-floor/security-floor-sites-v1.js";

describe("customer-security-sites-v1", () => {
  it("lists UI-visible sites with Japanese labels", () => {
    const sites = listCustomerSecuritySitesV1();
    assert.ok(sites.length >= 2);
    const itabashi = sites.find(
      (s) => s.siteId === SECURITY_FLOOR_ITABASHI_LIVE_SITE_ID_V1
    );
    const toyoshima = sites.find(
      (s) => s.siteId === SEC_JP_TOYOSHIMA_SITE_ID_V1
    );
    assert.ok(itabashi);
    assert.ok(toyoshima);
    assert.equal(itabashi?.displayName, "板橋自宅");
    assert.equal(toyoshima?.displayName, "豊島邸");
    assert.equal(toyoshima?.useToyoshimaDashboard, true);
    assert.equal(itabashi?.useToyoshimaDashboard, false);
  });

  it("default site is itabashi live", () => {
    assert.equal(
      defaultCustomerSecuritySiteIdV1(),
      SECURITY_FLOOR_ITABASHI_LIVE_SITE_ID_V1
    );
  });

  it("selectable check and label helper", () => {
    assert.equal(
      isCustomerSecuritySiteSelectableV1(SEC_JP_TOYOSHIMA_SITE_ID_V1),
      true
    );
    assert.equal(isCustomerSecuritySiteSelectableV1("SEC-UNKNOWN"), false);
    assert.equal(
      customerSecuritySiteLabelV1(SEC_JP_TOYOSHIMA_SITE_ID_V1),
      "豊島邸"
    );
  });
});

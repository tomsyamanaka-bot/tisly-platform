/**
 * 社内OTAカードの物件解決と表示文。
 * 未登録のIDは板橋へ落とさない。
 */

const OTA_SITE_RULES = [
  {
    slug: "ryugasaki",
    keys: [
      "RYUGASAKI",
      "WASHMATE",
      "SEC-JP-RYUGASAKI-001",
      "HOME-JP-RYUGASAKI",
      "WASHMATE001",
    ],
  },
  {
    slug: "keeprising",
    keys: [
      "KEEPRISING",
      "RISING001",
      "SEC-JP-KEEPRISING-001",
      "HOME-JP-KEEPRISING",
      "KEEPRISING001",
    ],
  },
  {
    slug: "toyoshima",
    keys: [
      "TOYOSHIMA",
      "TOSHIMA",
      "SEC-JP-TOYOSHIMA-001",
      "HOME-JP-TOYOSHIMA",
      "TOYOSHIMA001",
    ],
  },
  {
    slug: "itabashi",
    keys: [
      "ITABASHI",
      "TOMS001",
      "HOME001",
      "SEC-JP-ITABASHI-LIVE",
      "HOME-JP-ITABASHI-LIVE",
    ],
  },
];

function normalizedSiteId(rawId) {
  return String(rawId || "").trim().toUpperCase();
}

function ruleMatches(id, rule) {
  return rule.keys.some((key) => id.includes(String(key).toUpperCase()));
}

/** 選択中IDをOTAスラッグへ。未知は空 */
export function resolveOtaSiteSlugV1(rawId) {
  const id = normalizedSiteId(rawId);
  if (!id) return "";
  const hit = OTA_SITE_RULES.find((rule) => ruleMatches(id, rule));
  return hit ? hit.slug : "";
}

export function formatFirmwareVersionLabel(raw) {
  const text = String(raw ?? "").trim();
  if (!text || text === "null" || text === "undefined") {
    return "未受信";
  }
  return text;
}

export function formatOtaHeartbeatLabel(iso) {
  if (!iso) return "未受信";
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return "未受信";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(t));
}

/** 更新の有無。pending だけでは待機にしない */
export function otaCardStatusText(data) {
  const waiting = !!(data && (data.has_ota_update || data.update_required));
  return waiting ? "更新待機中" : "最新適用済み";
}

export function buildOtaVersionRequestV1(slug, channel, nowMs) {
  const key = String(slug || "").trim();
  const params = new URLSearchParams();
  params.set("channel", channel === "staging" ? "staging" : "production");
  params.set("t", String(Number(nowMs) || Date.now()));
  return {
    url: `/api/firmware/${encodeURIComponent(key)}/version?${params.toString()}`,
    init: { cache: "no-store" },
  };
}

function itabashiSelected(rawId) {
  return ruleMatches(normalizedSiteId(rawId), OTA_SITE_RULES[3]);
}

/**
 * 配信先は選択中の物件だけ。
 * 板橋への取り違えは送らない。
 */
export function buildOtaDeployRequestV1(input) {
  const liveId = String(input?.siteId || "").trim();
  const channel = input?.channel === "staging" ? "staging" : "production";
  if (input?.allSites === true) {
    return {
      ok: true,
      slug: "all",
      url: "/api/firmware/all/deploy",
      body: {
        channel,
        allSites: true,
        siteId: "all",
        currentSiteId: liveId || "all",
      },
    };
  }
  const slug = resolveOtaSiteSlugV1(liveId);
  if (!slug) return { ok: false, reason: "unmapped" };
  if (slug === "itabashi" && !itabashiSelected(liveId)) {
    return { ok: false, reason: "misfire" };
  }
  return {
    ok: true,
    slug,
    url: `/api/firmware/${encodeURIComponent(slug)}/deploy`,
    body: {
      channel,
      allSites: false,
      siteId: liveId,
      currentSiteId: liveId,
    },
  };
}

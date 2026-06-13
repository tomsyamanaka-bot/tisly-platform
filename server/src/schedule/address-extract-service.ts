/** Google Calendar イベントから現場住所を抽出 */

import { getDatabase } from "../db/database.js";
import { findLinkByGoogleEventId } from "./google-calendar-sync-store.js";
import type { ScheduleEvent } from "./schedule-types.js";
import { maskAddressForDisplay } from "./schedule-settings-store.js";

export type AddressSource = "location" | "description" | "project" | "title_place" | "none";

export interface ExtractedAddress {
  /** ナビ・API用のフル住所（取得できた場合） */
  fullAddress: string | null;
  /** UI表示用（マスク済み） */
  displayAddress: string;
  source: AddressSource;
  /** 件名のみの地名推定 */
  uncertain: boolean;
  mapsAvailable: boolean;
  /** 天気・ジオコード用の市区町村ヒント */
  cityHint: string | null;
}

const PREFECTURE_RE =
  /(?:北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)/;

const ADDRESS_LINE_RE =
  /(?:住所|所在地|現場|場所|工事場所|お客様住所)[：:\s　]*([^\n\r]{4,80})/i;

const POSTAL_ADDRESS_RE = /〒?\s*\d{3}-?\d{4}\s*([^\n\r]{4,80})/;

const STREET_ADDRESS_RE =
  /(?:^|[\s　])((?:北海道|.{2,3}県|東京都|京都府|大阪府).{0,30}[市区町村].{2,60})/;

const CITY_ONLY_RE = /([\u4e00-\u9fff]{1,10}[市区町村])/;

function cleanAddressCandidate(raw: string): string {
  return raw
    .replace(/[（(].*?[）)]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[、,].*$/, "")
    .trim();
}

function looksLikeFullAddress(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (PREFECTURE_RE.test(t)) return true;
  if (/[市区町村]/.test(t) && /[0-9０-９\-－丁目番地号]/.test(t)) return true;
  if (/[市区町村]/.test(t) && t.length >= 6) return true;
  return false;
}

function extractFromDescription(description: string | null | undefined): string | null {
  if (!description?.trim()) return null;
  const text = description.trim();
  for (const re of [ADDRESS_LINE_RE, POSTAL_ADDRESS_RE, STREET_ADDRESS_RE]) {
    const m = text.match(re);
    if (m?.[1]) {
      const candidate = cleanAddressCandidate(m[1]);
      if (looksLikeFullAddress(candidate)) return candidate;
    }
  }
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const candidate = cleanAddressCandidate(line);
    if (looksLikeFullAddress(candidate)) return candidate;
  }
  return null;
}

function extractCityFromTitle(title: string): string | null {
  const m = title.match(CITY_ONLY_RE);
  if (!m?.[1]) return null;
  const city = m[1];
  if (title.trim() === city) return city;
  if (title.includes(city) && !looksLikeFullAddress(title)) return city;
  return null;
}

function loadProjectAddress(
  projectSource: string,
  projectId: string
): string | null {
  const db = getDatabase();
  if (projectSource === "business") {
    const row = db
      .prepare(`SELECT address FROM business_projects WHERE id = ?`)
      .get(projectId) as { address?: string } | undefined;
    const addr = String(row?.address ?? "").trim();
    return addr || null;
  }
  if (projectSource === "survey") {
    const row = db
      .prepare(`SELECT address FROM survey_projects WHERE project_id = ?`)
      .get(projectId) as { address?: string } | undefined;
    const addr = String(row?.address ?? "").trim();
    return addr || null;
  }
  return null;
}

export interface EventProjectRef {
  projectSource: "survey" | "business";
  projectId: string;
}

function normalizeTitleKey(title: string): string {
  return title.trim().replace(/\s+/g, "");
}

function resolveEventProjectRefByTitle(title: string): EventProjectRef | null {
  const key = normalizeTitleKey(title);
  if (!key || key === "案件") return null;
  const db = getDatabase();

  const surveyRows = db
    .prepare(
      `SELECT project_id, site_name, customer_name
       FROM survey_projects
       WHERE status NOT IN ('archived', 'deleted')
       ORDER BY survey_date DESC, updated_at DESC
       LIMIT 200`
    )
    .all() as Array<{ project_id: string; site_name?: string | null; customer_name?: string | null }>;

  for (const row of surveyRows) {
    const candidates = [row.site_name, row.customer_name].map((v) => normalizeTitleKey(String(v ?? "")));
    if (candidates.some((c) => c && (c === key || key.includes(c) || c.includes(key)))) {
      return { projectSource: "survey", projectId: String(row.project_id) };
    }
  }

  const businessRows = db
    .prepare(
      `SELECT id, title, customer_name
       FROM business_projects
       ORDER BY updated_at DESC
       LIMIT 200`
    )
    .all() as Array<{ id: string; title?: string | null; customer_name?: string | null }>;

  for (const row of businessRows) {
    const candidates = [row.title, row.customer_name].map((v) => normalizeTitleKey(String(v ?? "")));
    if (candidates.some((c) => c && (c === key || key.includes(c) || c.includes(key)))) {
      return { projectSource: "business", projectId: String(row.id) };
    }
  }

  return null;
}

function resolveEventProjectRef(event: ScheduleEvent): EventProjectRef | null {
  const externalId = event.externalId?.trim();
  if (externalId) {
    const link = findLinkByGoogleEventId(externalId);
    if (link?.projectId && (link.projectSource === "survey" || link.projectSource === "business")) {
      return { projectSource: link.projectSource, projectId: link.projectId };
    }
  }
  const db = getDatabase();
  const byScheduleId = db
    .prepare(
      `SELECT project_source, project_id FROM google_calendar_event_links
       WHERE schedule_event_id = ? LIMIT 1`
    )
    .get(event.id) as { project_source?: string; project_id?: string } | undefined;
  if (
    byScheduleId?.project_id &&
    (byScheduleId.project_source === "survey" || byScheduleId.project_source === "business")
  ) {
    return {
      projectSource: byScheduleId.project_source as "survey" | "business",
      projectId: String(byScheduleId.project_id),
    };
  }
  return resolveEventProjectRefByTitle(event.title);
}

function resolveProjectAddress(event: ScheduleEvent): string | null {
  const ref = resolveEventProjectRef(event);
  if (!ref) return null;
  return loadProjectAddress(ref.projectSource, ref.projectId);
}

export { resolveEventProjectRef };

export function extractEventAddress(event: ScheduleEvent): ExtractedAddress {
  const location = event.location?.trim();
  if (location) {
    const display = maskAddressForDisplay(location);
    return {
      fullAddress: location,
      displayAddress: display || location,
      source: "location",
      uncertain: !looksLikeFullAddress(location),
      mapsAvailable: true,
      cityHint: location.match(CITY_ONLY_RE)?.[1] ?? null,
    };
  }

  const fromDesc = extractFromDescription(event.description);
  if (fromDesc) {
    const display = maskAddressForDisplay(fromDesc);
    return {
      fullAddress: fromDesc,
      displayAddress: display || fromDesc,
      source: "description",
      uncertain: false,
      mapsAvailable: true,
      cityHint: fromDesc.match(CITY_ONLY_RE)?.[1] ?? null,
    };
  }

  const projectAddr = resolveProjectAddress(event);
  if (projectAddr) {
    const display = maskAddressForDisplay(projectAddr);
    return {
      fullAddress: projectAddr,
      displayAddress: display || projectAddr,
      source: "project",
      uncertain: false,
      mapsAvailable: true,
      cityHint: projectAddr.match(CITY_ONLY_RE)?.[1] ?? null,
    };
  }

  const cityFromTitle = extractCityFromTitle(event.title);
  if (cityFromTitle) {
    return {
      fullAddress: null,
      displayAddress: "住所未確定",
      source: "title_place",
      uncertain: true,
      mapsAvailable: false,
      cityHint: cityFromTitle,
    };
  }

  return {
    fullAddress: null,
    displayAddress: "住所未設定",
    source: "none",
    uncertain: true,
    mapsAvailable: false,
    cityHint: null,
  };
}

export function geocodeQueryFromAddress(address: ExtractedAddress): string | null {
  if (address.fullAddress) return address.fullAddress;
  return address.cityHint;
}

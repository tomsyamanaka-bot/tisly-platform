/**
 * 日の出と日の入りをサーバーだけで求める。
 * 外部の天文 API は使わない。
 * 実機の版と config.py は変えない。
 */

export const ASTRO_DEFAULT_LAT_V1 = 35.75;
export const ASTRO_DEFAULT_LON_V1 = 139.7;
export const ASTRO_DEFAULT_TZ_SEC_V1 = 32400;
export const ASTRO_DEFAULT_SUNSET_OFFSET_MIN_V1 = -15;
export const ASTRO_DEFAULT_SUNRISE_OFFSET_MIN_V1 = 15;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface AstroPlaceV1 {
  latitude: number;
  longitude: number;
  timezoneOffsetSec: number;
}

export interface AstroWindowV1 {
  sunriseHm: string;
  sunsetHm: string;
  startHm: string;
  endHm: string;
  overnight: boolean;
  label: string;
}

interface SiteGeoV1 {
  ids: string[];
  latitude: number;
  longitude: number;
}

/** 台帳の地名に近い代表点。番地は置かない。 */
const SITE_GEO_V1: SiteGeoV1[] = [
  {
    ids: ["HOME-JP-ITABASHI-LIVE", "SEC-JP-ITABASHI-LIVE", "TOMS001"],
    latitude: 35.751,
    longitude: 139.709,
  },
  {
    ids: ["HOME-JP-TOYOSHIMA", "SEC-JP-TOYOSHIMA-001", "TOYOSHIMA001"],
    latitude: 36.0,
    longitude: 140.15,
  },
  {
    ids: ["HOME-JP-RYUGASAKI", "SEC-JP-RYUGASAKI-001", "WASHMATE001"],
    latitude: 35.911,
    longitude: 140.183,
  },
];

function norm360(deg: number): number {
  let n = deg % 360;
  if (n < 0) n += 360;
  return n;
}

function norm24(hours: number): number {
  let n = hours % 24;
  if (n < 0) n += 24;
  return n;
}

export function clampAstroOffsetMinV1(
  value: unknown,
  fallback: number
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < -180 || rounded > 180) return fallback;
  return rounded;
}

export function clampTimezoneOffsetSecV1(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return ASTRO_DEFAULT_TZ_SEC_V1;
  const min = -12 * 3600;
  const max = 14 * 3600;
  if (n < min || n > max) return ASTRO_DEFAULT_TZ_SEC_V1;
  return Math.round(n);
}

export function siteAstroPlaceV1(siteId: string): AstroPlaceV1 {
  const key = String(siteId || "").trim().toUpperCase();
  const hit = SITE_GEO_V1.find((row) =>
    row.ids.some((id) => id.toUpperCase() === key)
  );
  return {
    latitude: hit?.latitude ?? ASTRO_DEFAULT_LAT_V1,
    longitude: hit?.longitude ?? ASTRO_DEFAULT_LON_V1,
    timezoneOffsetSec: ASTRO_DEFAULT_TZ_SEC_V1,
  };
}

export function civilDateV1(
  at: Date,
  timezoneOffsetSec: number
): { year: number; month: number; day: number } {
  const shifted = new Date(at.getTime() + timezoneOffsetSec * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function dayOfYear(year: number, month: number, day: number): number {
  const n1 = Math.floor((275 * month) / 9);
  const n2 = Math.floor((month + 9) / 12);
  const n3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  return n1 - n2 * n3 + day - 30;
}

/**
 * NOAA の太陽公式。戻りは現地の時刻（時）。
 * 極夜と白夜は null。
 */
export function solarLocalHoursV1(
  kind: "sunrise" | "sunset",
  year: number,
  month: number,
  day: number,
  latitude: number,
  longitude: number,
  timezoneOffsetSec: number
): number | null {
  const n = dayOfYear(year, month, day);
  const lngHour = longitude / 15;
  const anchor = kind === "sunrise" ? 6 : 18;
  const t = n + (anchor - lngHour) / 24;
  const mean = 0.9856 * t - 3.289;
  let lonSun =
    mean +
    1.916 * Math.sin(mean * RAD) +
    0.02 * Math.sin(2 * mean * RAD) +
    282.634;
  lonSun = norm360(lonSun);
  let ra = DEG * Math.atan(0.91764 * Math.tan(lonSun * RAD));
  ra = norm360(ra);
  const lQuad = Math.floor(lonSun / 90) * 90;
  const raQuad = Math.floor(ra / 90) * 90;
  ra = (ra + (lQuad - raQuad)) / 15;
  const sinDec = 0.39782 * Math.sin(lonSun * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH =
    (Math.cos(90.833 * RAD) - sinDec * Math.sin(latitude * RAD)) /
    (cosDec * Math.cos(latitude * RAD));
  if (cosH > 1 || cosH < -1 || !Number.isFinite(cosH)) return null;
  let hourAngle = DEG * Math.acos(cosH);
  if (kind === "sunrise") hourAngle = 360 - hourAngle;
  hourAngle /= 15;
  const localMean = hourAngle + ra - 0.06571 * t - 6.622;
  const universal = norm24(localMean - lngHour);
  return norm24(universal + timezoneOffsetSec / 3600);
}

export function hoursToHmV1(hours: number): string {
  const total = Math.round(norm24(hours) * 60);
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hh = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function hmToMinutesV1(hm: string): number {
  const [h, m] = hm.split(":").map((part) => Number(part));
  return h * 60 + m;
}

export function minutesToHmV1(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hh = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function offsetPhrase(label: string, minutes: number): string {
  if (minutes > 0) return `${label}+${minutes}分`;
  if (minutes < 0) return `${label}${minutes}分`;
  return `${label}+0分`;
}

export function buildAstroWindowV1(input: {
  at?: Date;
  latitude: number;
  longitude: number;
  timezoneOffsetSec: number;
  sunsetOffsetMin: number;
  sunriseOffsetMin: number;
}): AstroWindowV1 | null {
  const at = input.at ?? new Date();
  const tz = input.timezoneOffsetSec;
  const civil = civilDateV1(at, tz);
  const sunrise = solarLocalHoursV1(
    "sunrise",
    civil.year,
    civil.month,
    civil.day,
    input.latitude,
    input.longitude,
    tz
  );
  const sunset = solarLocalHoursV1(
    "sunset",
    civil.year,
    civil.month,
    civil.day,
    input.latitude,
    input.longitude,
    tz
  );
  if (sunrise == null || sunset == null) return null;
  const sunriseHm = hoursToHmV1(sunrise);
  const sunsetHm = hoursToHmV1(sunset);
  const startMin = hmToMinutesV1(sunsetHm) + input.sunsetOffsetMin;
  const endMin = hmToMinutesV1(sunriseHm) + input.sunriseOffsetMin;
  const startHm = minutesToHmV1(startMin);
  const endHm = minutesToHmV1(endMin);
  const overnight = hmToMinutesV1(startHm) > hmToMinutesV1(endHm);
  const endMark = overnight ? `翌${endHm}` : endHm;
  const label =
    `本日の自動点灯時間：${startHm} 〜 ${endMark}` +
    `（${offsetPhrase("日没", input.sunsetOffsetMin)} / ` +
    `${offsetPhrase("日の出", input.sunriseOffsetMin)}）`;
  return {
    sunriseHm,
    sunsetHm,
    startHm,
    endHm,
    overnight,
    label,
  };
}

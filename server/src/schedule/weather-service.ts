/** Open-Meteo 本接続 — 朝・昼・夜の降水確率・気温 */

export type WeatherPeriod = "morning" | "afternoon" | "night";

export interface WeatherSlot {
  period: WeatherPeriod;
  label: string;
  icon: string;
  precipChance: number;
  tempC: number;
  highlightRain: boolean;
}

export interface DayWeather {
  date: string;
  location: string;
  lat: number;
  lon: number;
  source: "mock" | "open-meteo";
  slots: WeatherSlot[];
}

const DEFAULT_LOCATION = {
  name: "守谷市",
  lat: 35.9514,
  lon: 140.0022,
};

function hashSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function pickIcon(precip: number): string {
  if (precip >= 60) return "🌧";
  if (precip >= 30) return "☁️";
  if (precip >= 10) return "⛅";
  return "☀️";
}

function mockSlots(date: string, location: string): WeatherSlot[] {
  const seed = hashSeed(`${date}:${location}`);
  const defs: Array<{ period: WeatherPeriod; label: string; baseTemp: number; precipMul: number }> = [
    { period: "morning", label: "朝", baseTemp: 22, precipMul: 0.5 },
    { period: "afternoon", label: "昼", baseTemp: 28, precipMul: 1 },
    { period: "night", label: "夜", baseTemp: 20, precipMul: 0.8 },
  ];
  return defs.map((d, i) => {
    const precip = Math.min(100, Math.round(((seed + i * 17) % 100) * d.precipMul));
    const tempC = d.baseTemp + ((seed >> (i * 3)) % 7) - 2;
    return {
      period: d.period,
      label: d.label,
      icon: pickIcon(precip),
      precipChance: precip,
      tempC,
      highlightRain: precip >= 50,
    };
  });
}

function hourIndexForPeriod(period: WeatherPeriod): number {
  if (period === "morning") return 8;
  if (period === "afternoon") return 14;
  return 20;
}

async function fetchOpenMeteoSlots(
  date: string,
  lat: number,
  lon: number
): Promise<WeatherSlot[] | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation_probability&timezone=Asia%2FTokyo` +
    `&start_date=${date}&end_date=${date}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    hourly?: {
      time?: string[];
      temperature_2m?: number[];
      precipitation_probability?: number[];
    };
  };
  const times = data.hourly?.time ?? [];
  const temps = data.hourly?.temperature_2m ?? [];
  const precips = data.hourly?.precipitation_probability ?? [];
  if (!times.length) return null;

  const defs: Array<{ period: WeatherPeriod; label: string }> = [
    { period: "morning", label: "朝" },
    { period: "afternoon", label: "昼" },
    { period: "night", label: "夜" },
  ];

  return defs.map((d) => {
    const targetHour = hourIndexForPeriod(d.period);
    let idx = times.findIndex((t) => t.startsWith(`${date}T${String(targetHour).padStart(2, "0")}`));
    if (idx < 0) idx = Math.min(times.length - 1, targetHour);
    const precip = Math.round(precips[idx] ?? 0);
    const tempC = Math.round(temps[idx] ?? 20);
    return {
      period: d.period,
      label: d.label,
      icon: pickIcon(precip),
      precipChance: precip,
      tempC,
      highlightRain: precip >= 50,
    };
  });
}

/** Open-Meteo を優先（OPEN_METEO_LIVE=0 でモック固定） */
export async function fetchDayWeather(
  date: string,
  opts?: { location?: string; lat?: number; lon?: number }
): Promise<DayWeather> {
  const location = opts?.location?.trim() || DEFAULT_LOCATION.name;
  const lat = opts?.lat ?? DEFAULT_LOCATION.lat;
  const lon = opts?.lon ?? DEFAULT_LOCATION.lon;
  const forceMock = process.env.OPEN_METEO_LIVE === "0";

  if (!forceMock) {
    try {
      const slots = await fetchOpenMeteoSlots(date, lat, lon);
      if (slots?.length) {
        return { date, location, lat, lon, source: "open-meteo", slots };
      }
    } catch {
      /* fall through */
    }
  }

  return {
    date,
    location,
    lat,
    lon,
    source: "mock",
    slots: mockSlots(date, location),
  };
}

/** Open-Meteo 連携準備 — 最初は守谷市固定モック */

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
  const defs: Array<{ period: WeatherPeriod; label: string; baseTemp: number }> = [
    { period: "morning", label: "朝", baseTemp: 22 },
    { period: "afternoon", label: "昼", baseTemp: 28 },
    { period: "night", label: "夜", baseTemp: 20 },
  ];
  return defs.map((d, i) => {
    const precip = (seed + i * 17) % 100;
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

/** 将来 Open-Meteo API に差し替え */
export async function fetchDayWeather(
  date: string,
  opts?: { location?: string; lat?: number; lon?: number }
): Promise<DayWeather> {
  const location = opts?.location?.trim() || DEFAULT_LOCATION.name;
  const lat = opts?.lat ?? DEFAULT_LOCATION.lat;
  const lon = opts?.lon ?? DEFAULT_LOCATION.lon;
  const useLive = process.env.OPEN_METEO_LIVE === "1";
  if (useLive) {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&daily=temperature_2m_max,precipitation_probability_max&timezone=Asia%2FTokyo` +
        `&start_date=${date}&end_date=${date}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          daily?: {
            temperature_2m_max?: number[];
            precipitation_probability_max?: number[];
          };
        };
        const maxT = data.daily?.temperature_2m_max?.[0] ?? 26;
        const precip = data.daily?.precipitation_probability_max?.[0] ?? 20;
        const slots: WeatherSlot[] = [
          {
            period: "morning",
            label: "朝",
            icon: pickIcon(Math.round(precip * 0.6)),
            precipChance: Math.round(precip * 0.6),
            tempC: Math.round(maxT - 4),
            highlightRain: precip >= 50,
          },
          {
            period: "afternoon",
            label: "昼",
            icon: pickIcon(precip),
            precipChance: precip,
            tempC: Math.round(maxT),
            highlightRain: precip >= 50,
          },
          {
            period: "night",
            label: "夜",
            icon: pickIcon(Math.round(precip * 0.8)),
            precipChance: Math.round(precip * 0.8),
            tempC: Math.round(maxT - 6),
            highlightRain: precip >= 50,
          },
        ];
        return { date, location, lat, lon, source: "open-meteo", slots };
      }
    } catch {
      /* fall through to mock */
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

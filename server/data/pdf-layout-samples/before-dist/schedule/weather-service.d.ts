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
/** Open-Meteo を優先（OPEN_METEO_LIVE=0 でモック固定） */
export declare function fetchDayWeather(date: string, opts?: {
    location?: string;
    lat?: number;
    lon?: number;
}): Promise<DayWeather>;

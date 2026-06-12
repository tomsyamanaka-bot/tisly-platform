/** 住所 → 緯度経度（Google Geocoding / Open-Meteo フォールバック） */

import { isGoogleMapsApiConfigured } from "./google-maps-service.js";

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
  source: "google" | "open-meteo" | "default";
}

const DEFAULT = { lat: 35.9514, lon: 140.0022, label: "守谷市" };

const memoryCache = new Map<string, GeocodeResult>();

export function clearGeocodeMemoryCache(): void {
  memoryCache.clear();
}

async function geocodeWithGoogle(query: string, key: string): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    address: query,
    language: "ja",
    region: "jp",
    key,
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  const json = (await res.json()) as {
    status?: string;
    results?: Array<{ formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }>;
  };
  const first = json.results?.[0];
  const lat = first?.geometry?.location?.lat;
  const lng = first?.geometry?.location?.lng;
  if (json.status === "OK" && typeof lat === "number" && typeof lng === "number") {
    return {
      lat,
      lon: lng,
      label: first?.formatted_address?.slice(0, 40) ?? query,
      source: "google",
    };
  }
  return null;
}

async function geocodeWithOpenMeteo(query: string): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    name: query,
    count: "1",
    language: "ja",
    format: "json",
  });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    results?: Array<{ name?: string; latitude?: number; longitude?: number; admin1?: string }>;
  };
  const first = json.results?.[0];
  if (typeof first?.latitude === "number" && typeof first?.longitude === "number") {
    const label = [first.name, first.admin1].filter(Boolean).join(" ");
    return { lat: first.latitude, lon: first.longitude, label: label || query, source: "open-meteo" };
  }
  return null;
}

export async function geocodeAddress(queryRaw: string): Promise<GeocodeResult> {
  const query = queryRaw.trim();
  if (!query) return { ...DEFAULT, source: "default" };

  const cached = memoryCache.get(query);
  if (cached) return cached;

  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (key && isGoogleMapsApiConfigured()) {
    try {
      const google = await geocodeWithGoogle(query, key);
      if (google) {
        memoryCache.set(query, google);
        return google;
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const om = await geocodeWithOpenMeteo(query);
    if (om) {
      memoryCache.set(query, om);
      return om;
    }
  } catch {
    /* fall through */
  }

  const fallback = { ...DEFAULT, label: query.slice(0, 20), source: "default" as const };
  memoryCache.set(query, fallback);
  return fallback;
}

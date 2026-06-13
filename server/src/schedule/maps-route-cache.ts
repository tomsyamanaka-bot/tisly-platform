/** Google Maps 移動時間キャッシュ — origin + destination + date（24時間） */

import { createHash } from "node:crypto";
import { getDatabase } from "../db/database.js";
import type { MapsDurationSource } from "./google-maps-service.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface RouteCacheEntry {
  origin: string;
  destination: string;
  routeDate: string;
  durationMin: number | null;
  durationSource: MapsDurationSource;
  cachedAt: string;
  cacheHit: boolean;
}

function cacheKey(origin: string, destination: string, routeDate: string): string {
  return createHash("sha256").update(`${origin}\0${destination}\0${routeDate}`).digest("hex");
}

export function getCachedRouteDuration(
  origin: string,
  destination: string,
  routeDate: string
): RouteCacheEntry | null {
  const key = cacheKey(origin, destination, routeDate);
  const row = getDatabase()
    .prepare(
      `SELECT origin, destination, route_date, duration_min, duration_source, cached_at
       FROM schedule_route_cache WHERE cache_key = ?`
    )
    .get(key) as
    | {
        origin: string;
        destination: string;
        route_date: string;
        duration_min: number | null;
        duration_source: string;
        cached_at: string;
      }
    | undefined;
  if (!row) return null;
  const cachedAt = new Date(row.cached_at).getTime();
  if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > CACHE_TTL_MS) {
    getDatabase().prepare(`DELETE FROM schedule_route_cache WHERE cache_key = ?`).run(key);
    return null;
  }
  return {
    origin: row.origin,
    destination: row.destination,
    routeDate: row.route_date,
    durationMin: row.duration_min,
    durationSource: row.duration_source as MapsDurationSource,
    cachedAt: row.cached_at,
    cacheHit: true,
  };
}

export function setCachedRouteDuration(
  origin: string,
  destination: string,
  routeDate: string,
  durationMin: number | null,
  durationSource: MapsDurationSource
): void {
  const key = cacheKey(origin, destination, routeDate);
  getDatabase()
    .prepare(
      `INSERT INTO schedule_route_cache
       (cache_key, origin, destination, route_date, duration_min, duration_source, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(cache_key) DO UPDATE SET
         duration_min = excluded.duration_min,
         duration_source = excluded.duration_source,
         cached_at = excluded.cached_at`
    )
    .run(key, origin, destination, routeDate, durationMin, durationSource);
}

export function purgeExpiredRouteCache(): number {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
  const r = getDatabase()
    .prepare(`DELETE FROM schedule_route_cache WHERE cached_at < ?`)
    .run(cutoff);
  return r.changes;
}

/** API キー設定前に保存された none/null キャッシュを削除（Directions 再試行用） */
export function purgeUnconfiguredRouteCache(): number {
  const r = getDatabase()
    .prepare(
      `DELETE FROM schedule_route_cache
       WHERE duration_source = 'none' AND duration_min IS NULL`
    )
    .run();
  return r.changes;
}

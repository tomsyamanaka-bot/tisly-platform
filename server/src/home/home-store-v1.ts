/**
 * TiSLY HOME — SaaS 永続化ストア v1
 *
 * テナント / 物件 / デバイス / 操作ログを
 * SQLite で一元管理する。月額課金プランの
 * 拡張に耐えるスキーマを前提とする。
 *
 * シードは INSERT OR IGNORE のみ。
 * 既存行は絶対に上書きしない。
 */

import { getDatabase } from "../db/database.js";
import {
  HOME_SITES_V1,
  type HomeSiteV1,
} from "./home-sites-v1.js";
import type { HomeControlTargetV1 } from "./home-control-v1.js";

let seeded = false;

function nowIso(): string {
  return new Date().toISOString();
}

/** デバイス種別（テーブル保存値） */
export type HomeDeviceKindV1 =
  | "ct_panel"
  | "bath_remote"
  | "aircon"
  | "smart_lock"
  | "intercom";

export interface HomeControlLogRowV1 {
  id: number;
  siteId: string;
  tenantId: string;
  deviceKind: string;
  deviceKey: string;
  action: string;
  value: string;
  actor: string;
  result: string;
  createdAt: string;
}

export interface HomeSiteRowV1 {
  siteId: string;
  tenantId: string;
  customerCode: string;
  countryCode: string;
  currency: string;
  displayName: string;
  planCode: string;
  planStatus: string;
  monthlyFee: number;
}

/**
 * 物件・デバイスの初期シード
 * 既存行があれば何もしない。
 */
export function ensureHomeSeedV1(): void {
  if (seeded) return;
  seeded = true;
  try {
    const db = getDatabase();
    const insertSite = db.prepare(`
      INSERT OR IGNORE INTO home_sites_v1 (
        site_id, tenant_id, customer_code, country_code,
        currency, kind, display_name, address_label,
        voltage_spec, hot_water_spec, plan_code,
        plan_status, monthly_fee, created_at, updated_at
      ) VALUES (
        @siteId, @tenantId, @customerCode, @countryCode,
        @currency, @kind, @displayName, @addressLabel,
        @voltageSpec, @hotWaterSpec, @planCode,
        @planStatus, @monthlyFee, @at, @at
      )
    `);
    const insertDevice = db.prepare(`
      INSERT OR IGNORE INTO home_devices_v1 (
        site_id, device_kind, device_key, label,
        control_channel, state_json, updated_at
      ) VALUES (
        @siteId, @deviceKind, @deviceKey, @label,
        @controlChannel, @stateJson, @at
      )
    `);

    const at = nowIso();
    const run = db.transaction((sites: HomeSiteV1[]) => {
      for (const site of sites) {
        insertSite.run({
          siteId: site.id,
          tenantId: site.tenantId,
          customerCode: site.customerCode,
          countryCode: site.countryCode,
          currency: site.currency,
          kind: site.kind,
          displayName: site.displayName,
          addressLabel: site.addressLabel,
          voltageSpec: site.voltageSpec,
          hotWaterSpec: site.hotWaterSpec,
          planCode: site.planCode,
          planStatus: site.planStatus,
          monthlyFee: site.monthlyFee,
          at,
        });
        const devices: Array<{
          deviceKind: HomeDeviceKindV1;
          deviceKey: string;
          label: string;
          controlChannel: string;
          state: unknown;
        }> = [
          {
            deviceKind: "ct_panel",
            deviceKey: site.ct.deviceKey,
            label: site.ct.label,
            controlChannel: site.ct.controlChannel,
            state: site.ct,
          },
          {
            deviceKind: "bath_remote",
            deviceKey: site.bath.deviceKey,
            label: site.bath.label,
            controlChannel: site.bath.controlChannel,
            state: site.bath,
          },
          {
            deviceKind: "smart_lock",
            deviceKey: site.lock.deviceKey,
            label: site.lock.label,
            controlChannel: site.lock.controlChannel,
            state: site.lock,
          },
          {
            deviceKind: "intercom",
            deviceKey: site.intercom.deviceKey,
            label: site.intercom.label,
            controlChannel: site.intercom.controlChannel,
            state: site.intercom,
          },
          ...site.aircons.map((ac) => ({
            deviceKind: "aircon" as HomeDeviceKindV1,
            deviceKey: ac.deviceKey,
            label: ac.label,
            controlChannel: ac.controlChannel,
            state: ac,
          })),
        ];
        for (const d of devices) {
          insertDevice.run({
            siteId: site.id,
            deviceKind: d.deviceKind,
            deviceKey: d.deviceKey,
            label: d.label,
            controlChannel: d.controlChannel,
            stateJson: JSON.stringify(d.state),
            at,
          });
        }
      }
    });
    run(HOME_SITES_V1);
  } catch {
    // DB 未初期化でも画面は動かす
  }
}

/** 制御操作ログを追記（失敗しても制御は継続） */
export function recordHomeControlLogV1(input: {
  siteId: string;
  tenantId: string;
  deviceKind: HomeControlTargetV1 | string;
  deviceKey?: string | null;
  action: string;
  value?: unknown;
  actor?: string | null;
  result: "ok" | "error";
}): void {
  try {
    ensureHomeSeedV1();
    const db = getDatabase();
    db.prepare(
      `INSERT INTO home_control_logs_v1 (
        site_id, tenant_id, device_kind, device_key,
        action, value, actor, result, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.siteId,
      input.tenantId,
      String(input.deviceKind),
      String(input.deviceKey ?? ""),
      input.action,
      JSON.stringify(input.value ?? null),
      String(input.actor ?? "app"),
      input.result,
      nowIso()
    );
  } catch {
    // ログ失敗で制御を止めない
  }
}

/** 入退室ログを追記 */
export function recordHomeAccessLogV1(input: {
  siteId: string;
  tenantId: string;
  credentialType: string;
  holderName: string;
  action: "lock" | "unlock";
  occurredAt?: string;
}): void {
  try {
    ensureHomeSeedV1();
    const db = getDatabase();
    db.prepare(
      `INSERT INTO home_access_logs_v1 (
        site_id, tenant_id, credential_type,
        holder_name, action, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      input.siteId,
      input.tenantId,
      input.credentialType,
      input.holderName,
      input.action,
      input.occurredAt ?? nowIso()
    );
  } catch {
    // ログ失敗で制御を止めない
  }
}

/** インターホン来客イベントを追記 */
export function recordHomeIntercomEventV1(input: {
  siteId: string;
  tenantId: string;
  deviceKey: string;
  eventType: string;
  visitorLabel?: string | null;
  handledAs?: string | null;
  actor?: string | null;
  occurredAt?: string;
}): void {
  try {
    ensureHomeSeedV1();
    const db = getDatabase();
    db.prepare(
      `INSERT INTO home_intercom_events_v1 (
        site_id, tenant_id, device_key, event_type,
        visitor_label, handled_as, actor, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.siteId,
      input.tenantId,
      input.deviceKey,
      input.eventType,
      String(input.visitorLabel ?? ""),
      String(input.handledAs ?? ""),
      String(input.actor ?? "app"),
      input.occurredAt ?? nowIso()
    );
  } catch {
    // ログ失敗で制御を止めない
  }
}

export interface HomeIntercomEventRowV1 {
  id: number;
  siteId: string;
  deviceKey: string;
  eventType: string;
  visitorLabel: string;
  handledAs: string;
  actor: string;
  occurredAt: string;
}

/** インターホン来客履歴（新しい順） */
export function listHomeIntercomEventsV1(
  siteId: string,
  limit = 20
): HomeIntercomEventRowV1[] {
  try {
    ensureHomeSeedV1();
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT id, site_id, device_key, event_type,
                visitor_label, handled_as, actor, occurred_at
         FROM home_intercom_events_v1
         WHERE site_id = ?
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(siteId, Math.max(1, Math.min(200, limit))) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => ({
      id: Number(r.id),
      siteId: String(r.site_id),
      deviceKey: String(r.device_key ?? ""),
      eventType: String(r.event_type),
      visitorLabel: String(r.visitor_label ?? ""),
      handledAs: String(r.handled_as ?? ""),
      actor: String(r.actor ?? ""),
      occurredAt: String(r.occurred_at),
    }));
  } catch {
    return [];
  }
}

/** 制御ログ取得（新しい順） */
export function listHomeControlLogsV1(
  siteId: string,
  limit = 20
): HomeControlLogRowV1[] {
  try {
    ensureHomeSeedV1();
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT id, site_id, tenant_id, device_kind, device_key,
                action, value, actor, result, created_at
         FROM home_control_logs_v1
         WHERE site_id = ?
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(siteId, Math.max(1, Math.min(200, limit))) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => ({
      id: Number(r.id),
      siteId: String(r.site_id),
      tenantId: String(r.tenant_id),
      deviceKind: String(r.device_kind),
      deviceKey: String(r.device_key ?? ""),
      action: String(r.action),
      value: String(r.value ?? ""),
      actor: String(r.actor ?? ""),
      result: String(r.result),
      createdAt: String(r.created_at),
    }));
  } catch {
    return [];
  }
}

/** 登録済み物件一覧（SaaS 契約ビュー） */
export function listHomeSiteRowsV1(): HomeSiteRowV1[] {
  try {
    ensureHomeSeedV1();
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT site_id, tenant_id, customer_code, country_code,
                currency, display_name, plan_code,
                plan_status, monthly_fee
         FROM home_sites_v1
         ORDER BY site_id`
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      siteId: String(r.site_id),
      tenantId: String(r.tenant_id),
      customerCode: String(r.customer_code ?? ""),
      countryCode: String(r.country_code),
      currency: String(r.currency),
      displayName: String(r.display_name),
      planCode: String(r.plan_code),
      planStatus: String(r.plan_status),
      monthlyFee: Number(r.monthly_fee ?? 0),
    }));
  } catch {
    return [];
  }
}

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
export type ProRemoteWsAction =
  | "floor_nav"
  | "pin_select"
  | "ack"
  | "close"
  | "escalate";

export interface ProRemoteStateSnapshot {
  projectId: string;
  lastAction: ProRemoteWsAction;
  tier?: string;
  pinId?: string;
  notificationId?: string;
  actor: string;
  at: string;
}

const memoryState = new Map<string, ProRemoteStateSnapshot>();

export function recordProRemoteState(input: {
  projectId: string;
  action: ProRemoteWsAction;
  tier?: string;
  pinId?: string;
  notificationId?: string;
  actor: string;
}): ProRemoteStateSnapshot {
  const snap: ProRemoteStateSnapshot = {
    projectId: input.projectId,
    lastAction: input.action,
    tier: input.tier,
    pinId: input.pinId,
    notificationId: input.notificationId,
    actor: input.actor,
    at: new Date().toISOString(),
  };
  memoryState.set(input.projectId, snap);

  const id = `PRO-${uuid().slice(0, 8).toUpperCase()}`;
  getDatabase()
    .prepare(
      `INSERT INTO pro_operations (id, project_id, action, tier, pin_id, notification_id, actor, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.projectId,
      input.action,
      input.tier ?? null,
      input.pinId ?? null,
      input.notificationId ?? null,
      input.actor,
      JSON.stringify(snap),
      snap.at
    );

  return snap;
}

export function getProRemoteState(projectId: string): ProRemoteStateSnapshot | null {
  return memoryState.get(projectId) ?? null;
}

export function listProOperations(projectId: string, limit = 20) {
  return getDatabase()
    .prepare(
      `SELECT id, project_id, action, tier, pin_id, notification_id, actor, created_at
       FROM pro_operations WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(projectId, limit);
}

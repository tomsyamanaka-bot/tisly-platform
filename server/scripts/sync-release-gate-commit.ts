#!/usr/bin/env tsx
/** npm run build 後 — release-gate-last.json の commit を現在 HEAD に同期 */

import {
  syncReleaseGateCommitOnBuild,
  RELEASE_GATE_MARKER,
} from "../src/deploy/release-gate-marker.js";

const payload = syncReleaseGateCommitOnBuild();
console.log("[TiSLY] release-gate commit synced:", RELEASE_GATE_MARKER);
console.log("[TiSLY] commit:", payload.commit);

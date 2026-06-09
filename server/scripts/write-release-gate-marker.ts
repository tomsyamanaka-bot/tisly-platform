#!/usr/bin/env tsx
/** Phase 1441–1460 — release:gate 成功時マーカー */

import { writeReleaseGateSuccessMarker, RELEASE_GATE_MARKER } from "../src/deploy/release-gate-marker.js";

const payload = writeReleaseGateSuccessMarker();
console.log("[TiSLY] release-gate marker written:", RELEASE_GATE_MARKER);
console.log("[TiSLY] commit:", payload.commit);

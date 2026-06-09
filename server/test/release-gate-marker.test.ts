import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("release-gate-marker", () => {
  let tempMarker: string;
  let previousMarkerEnv: string | undefined;

  beforeEach(() => {
    tempMarker = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "tisly-rg-marker-")),
      "release-gate-last.json"
    );
    previousMarkerEnv = process.env.TISLY_RELEASE_GATE_MARKER_PATH;
    process.env.TISLY_RELEASE_GATE_MARKER_PATH = tempMarker;
  });

  afterEach(() => {
    if (previousMarkerEnv === undefined) {
      delete process.env.TISLY_RELEASE_GATE_MARKER_PATH;
    } else {
      process.env.TISLY_RELEASE_GATE_MARKER_PATH = previousMarkerEnv;
    }
    fs.rmSync(path.dirname(tempMarker), { recursive: true, force: true });
  });

  it("syncReleaseGateCommitOnBuild writes current git HEAD commit", async () => {
    const expectedCommit = execSync("git rev-parse HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();

    const { syncReleaseGateCommitOnBuild, readReleaseGateMarker } = await import(
      "../src/deploy/release-gate-marker.js"
    );

    const payload = syncReleaseGateCommitOnBuild();
    assert.equal(payload.commit, expectedCommit);
    assert.equal(payload.build, true);
    assert.equal(payload.test, false);
    assert.equal(payload.tsc, false);

    const onDisk = readReleaseGateMarker();
    assert.equal(onDisk?.commit, expectedCommit);
  });

  it("getBuildVersion prefers live git HEAD over stale marker commit", async () => {
    const expectedCommit = execSync("git rev-parse HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();

    fs.writeFileSync(
      tempMarker,
      JSON.stringify(
        {
          generatedAt: "2020-01-01T00:00:00.000Z",
          build: true,
          test: true,
          tsc: true,
          commit: "d721f45deadbeefdeadbeefdeadbeefdeadbeef",
          buildNumber: "RC2-1500",
        },
        null,
        2
      ),
      "utf8"
    );

    const { getBuildVersion } = await import("../src/deploy/build-version.js");
    const version = getBuildVersion();
    assert.equal(version.commit, expectedCommit);
    assert.equal(version.commitShort, expectedCommit.slice(0, 7));
  });
});

# TiSLY Android TWA (Google Play)

Trusted Web Activity packaging for https://tisly.jp (`com.tisly.app`).

## Prerequisites

- Node.js 20+
- JDK 17 (`JAVA_HOME`)
- Android command-line tools (Bubblewrap can download them on first run)

## One-shot build

From the repository root:

```bash
npm run build:android
```

Outputs (local; `.aab` is gitignored):

- `android/app-release-bundle.aab`
- `play-console-upload/TiSLY-com.tisly.app.aab` ← Play Console へこれ
- `android/AAB_READY.txt` / `play-console-upload/AAB_READY.txt`（絶対パス・サイズ）

```bash
npm run android:open-aab   # Explorer で AAB を選択表示
```

## Signing

1. Create a local keystore (not committed):

```bash
npm run android:keystore
```

2. Set passwords before a signed build:

```bash
# PowerShell
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = "..."
$env:BUBBLEWRAP_KEY_PASSWORD = "..."
npm run build:android
```

Without passwords the build still produces an **unsigned** AAB (`--skipSigning`).

3. Sync Digital Asset Links after keystore / Play App Signing:

```bash
npm run android:sync-assetlinks
```

Then deploy so `https://tisly.jp/.well-known/assetlinks.json` is live.

If you use Play App Signing, add the **App signing key certificate** SHA-256 from Play Console into `fingerprints` (or run sync after recording it).

## Config

| File | Role |
|------|------|
| `android/twa-manifest.json` | Bubblewrap / TWA settings |
| `server/public/.well-known/assetlinks.json` | Digital Asset Links |
| `server/public/manifest.webmanifest` | PWA manifest (`start_url: /app`) |

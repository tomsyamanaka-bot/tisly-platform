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

## Signing (required for Play Console)

Release keystore: `android/tisly-release-key.jks` (gitignored).

```bash
npm run android:keystore   # 初回のみ（既存 android.keystore は自動コピー）
npm run build:android      # 署名済み AAB を生成（デフォルト）
```

Passwords default to `tisly-android-dev` unless you set:

- `TISLY_ANDROID_KEYSTORE_PASSWORD`
- `BUBBLEWRAP_KEYSTORE_PASSWORD`

Gradle reads `android/keystore.properties` (auto-written each build).

Unsigned builds (local only): `npm run build:android:unsigned`

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

# TiSLY Android アプリ (Google Play)

`com.tisly.app` は **アプリ内 WebView**（Chrome Custom Tabs / アドレスバーなし）です。

起動直後はネイティブ開始画面（TiSLY HOME + 「開始する」）を出し、タップ後に
`https://tisly.jp/customer` を全画面 WebView で開きます。

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
| `android/twa-manifest.json` | Bubblewrap 生成の土台（`startUrl: /customer` · `fallbackType: webview`） |
| `android-shell/` | ネイティブ開始画面 + 全画面 WebView（ビルド時に生成プロジェクトへ合成） |
| `server/public/.well-known/assetlinks.json` | Digital Asset Links |
| `server/public/manifest.webmanifest` | PWA manifest |

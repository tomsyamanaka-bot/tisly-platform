# TiSLY iOS — App Store Connect API キー登録手順

手元 Mac / Fastlane / `.p12` は不要です。CI は **xcodebuild Automatic Signing + ASC API キー**のみ使います。

## 必須

| 種類 | 名前 | 内容 |
|------|------|------|
| Secret | `APP_STORE_KEY_ID` | API Key ID |
| Secret | `APP_STORE_ISSUER_ID` | Issuer ID（UUID） |
| Secret | `APP_STORE_PRIVATE_KEY` | `.p8` 全文 |
| **Variable** | `APPLE_TEAM_ID` | Team ID（10 文字・秘密ではない） |

CI: [`.github/workflows/ios-build-deploy.yml`](../.github/workflows/ios-build-deploy.yml)

---

## 1. API キー

1. [App Store Connect](https://appstoreconnect.apple.com) → ユーザとアクセス → 統合 → App Store Connect API
2. キー生成（Admin 推奨）→ Issuer ID / Key ID を控える → `.p8` をダウンロード

## 2. GitHub 登録

**Secrets:** `APP_STORE_KEY_ID` / `APP_STORE_ISSUER_ID` / `APP_STORE_PRIVATE_KEY`  
**Variables:** `APPLE_TEAM_ID`（Membership の Team ID）

## 3. 実行

Actions → **iOS Build & Deploy (Capacitor)** → Run workflow  
（`upload: false` で IPA のみも可）

フロー: `npm run build` → `cap sync ios` → `xcodeproj` で bundle/team 設定 → `xcodebuild archive` → `exportArchive` → `altool --upload-app`

exit 65 時は Artifact の `archive.log` を確認（Signing / Provisioning / CocoaPods の error 行）。

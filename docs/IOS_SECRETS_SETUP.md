# TiSLY iOS — App Store Connect API キー登録手順

手元 Mac / Fastlane / `.p12` は不要です。CI は **xcodebuild Automatic Signing + ASC API キー**のみ使います。

## 必須

| 種類 | 名前 | 内容 |
|------|------|------|
| Secret | `APP_STORE_KEY_ID` | API Key ID |
| Secret | `APP_STORE_ISSUER_ID` | Issuer ID（UUID） |
| Secret | `APP_STORE_PRIVATE_KEY` | `.p8` 全文 |
| **Variable**（推奨） | `APPLE_TEAM_ID` または `APP_TEAM_ID` | Team ID（10 文字・秘密ではない） |

※ Team ID は **Variables** に登録してください（Secrets だとログが `***` になり形式チェックと紛らわしくなります）。  
解決順: `vars.APPLE_TEAM_ID` → `vars.APP_TEAM_ID` → `secrets.APPLE_TEAM_ID` → `secrets.APP_TEAM_ID`。  
正規 IPA パス: `ios/App/build/TiSLY.ipa`（絶対パス `${GITHUB_WORKSPACE}/ios/App/build/TiSLY.ipa`）。

CI: [`.github/workflows/ios-build-deploy.yml`](../.github/workflows/ios-build-deploy.yml)

---

## 1. API キー

1. [App Store Connect](https://appstoreconnect.apple.com) → ユーザとアクセス → 統合 → App Store Connect API
2. キー生成（Admin 推奨）→ Issuer ID / Key ID を控える → `.p8` をダウンロード

## 2. GitHub 登録

**Secrets:** `APP_STORE_KEY_ID` / `APP_STORE_ISSUER_ID` / `APP_STORE_PRIVATE_KEY`  
**Variables:** `APPLE_TEAM_ID`（または `APP_TEAM_ID`）— Membership の Team ID

## 3. 実行

Actions → **iOS Build & Deploy (Capacitor)** → Run workflow  
（`upload: false` で IPA のみも可）

`master` へ iOS 関連パス（ワークフロー / `scripts/ios-*` / `ios-ci/**`）を push した場合も自動起動します。

フロー: `npm run build` → `cap sync ios` → gem CocoaPods → Automatic Signing → `xcodebuild archive`（`-allowProvisioningUpdates` + ASC API）→ **必須** `exportArchive` → IPA 内 `embedded.mobileprovision` 検証 → TestFlight アップロード

ITMS-90174 対策: 未署名 Payload zip は禁止。API キーは **Admin** 推奨（証明書・プロファイル自動作成）。
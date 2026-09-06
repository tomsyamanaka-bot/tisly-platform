# TiSLY iOS 自動ビルド＆ App Store Connect デプロイ手順

Windows のみでも、**GitHub Actions（`macos-latest`）** 経由で Capacitor iOS をアーカイブし、TestFlight へアップロードできます。

**署名は App Store Connect API キーのみ**（手元 Mac・`.p12`・プロビジョニングプロファイルの Secrets 登録は不要）。

関連:

- **正規ワークフロー**: [`.github/workflows/ios-build-deploy.yml`](../.github/workflows/ios-build-deploy.yml)
- **必須 Secrets（3 キー）**: [IOS_SECRETS_SETUP.md](./IOS_SECRETS_SETUP.md)
- Capacitor: [`capacitor.config.ts`](../capacitor.config.ts)（`appId: jp.tisly.app`）
- Info.plist テンプレ: [`ios-ci/Info.plist.permissions.template.xml`](../ios-ci/Info.plist.permissions.template.xml)
- Android TWA: `com.tisly.app`（別 ID）。iOS も本番 URL `https://tisly.jp` を表示（既存 PWA・DB・写真ルールは変更なし）

---

## 1. 前提（Apple Developer）

1. [Apple Developer Program](https://developer.apple.com) 加入・承認済み
2. Identifiers に **App ID** `jp.tisly.app`（必要なら Push 等を有効化）
3. [App Store Connect](https://appstoreconnect.apple.com) でアプリ作成（Bundle ID = `jp.tisly.app`）
4. **App Store Connect API** キーを発行（`.p8` を保存）

証明書・プロファイルの手元書き出しは**不要**です。CI は ASC API キー認証付きの **Xcode Automatic Signing**（`-allowProvisioningUpdates`）で署名します。

---

## 2. GitHub Secrets / Variables

| 名前 | 種類 | 必須 | 内容 |
|------|------|------|------|
| `APP_STORE_KEY_ID` | Secret | ✅ | API Key ID |
| `APP_STORE_ISSUER_ID` | Secret | ✅ | Issuer ID |
| `APP_STORE_PRIVATE_KEY` | Secret | ✅ | `.p8` 全文 |
| `APPLE_TEAM_ID` | **Variable**（推奨） | ✅※ | Team ID（10 文字・秘密ではない） |

※ Team ID 未設定だと Xcode 自動署名が失敗します。証明書ファイルではありません。

**使わない（廃止）:** `BUILD_CERTIFICATE_BASE64`, `CERTIFICATE_PASSWORD`, `BUILD_PROVISION_PROFILE_BASE64`, `PROVISIONING_PROFILE_NAME`, `KEYCHAIN_PASSWORD`

詳細: [IOS_SECRETS_SETUP.md](./IOS_SECRETS_SETUP.md)

---

## 3. ワークフローの動かし方

1. GitHub → **Actions → iOS Build & Deploy (Capacitor)** → **Run workflow**
2. 入力:
   - `upload`: TestFlight へ上げるなら true（IPA のみなら false）
   - `server_url`: 通常は `https://tisly.jp`
3. 成功後: Artifact `TiSLY-ios-ipa`、および `upload=true` なら TestFlight にバイナリ

タグ起動: `ios-v1.0.0` または `v1.0.0-ios`

---

## 4. ローカル（Windows）でできること

```bash
npm install
npm run build
npm run cap:prepare
npm run ios:check
```

Xcode / `cap add ios` は Mac / CI のみ。

---

## 5. Capacitor 構成の要点

| 項目 | 値 |
|------|-----|
| appId | `jp.tisly.app` |
| appName | `TiSLY` |
| webDir | `www`（`npm run cap:prepare` で `server/public` から生成） |
| 本番表示 | `server.url = https://tisly.jp` |
| 写真ルール | 変更なし |

---

## 6. トラブルシュート

| 症状 | 確認 |
|------|------|
| `APP_STORE_*` 不足で失敗 | [IOS_SECRETS_SETUP.md](./IOS_SECRETS_SETUP.md) |
| cert が証明書上限で失敗 | Developer → Certificates で不要な Distribution を削除 |
| Bundle ID エラー | App Store Connect / Identifiers に `jp.tisly.app` があるか |
| API キー権限不足 | Admin または App Manager（証明書作成可能） |
| 既存 VPS への影響 | 本 WF は独立。`deploy-vps.yml` とは別 |

VPS 確認: https://tisly.jp/api/health の `commitShort`

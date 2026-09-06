# TiSLY iOS — App Store Connect API / 署名 Secrets

ITMS-90174（プロビジョニングなし）を防ぐため、CI は **署名付き archive + exportArchive** のみ許可します（未署名 Payload zip 禁止）。

## 必須

| 種類 | 名前 | 内容 |
|------|------|------|
| Secret | `APP_STORE_KEY_ID` | API Key ID |
| Secret | `APP_STORE_ISSUER_ID` | Issuer ID（UUID） |
| Secret | `APP_STORE_PRIVATE_KEY` | `.p8` 全文 |
| **Variable**（推奨） | `APPLE_TEAM_ID` または `APP_TEAM_ID` | Team ID（10 文字） |

※ Team ID は **Variables** 推奨。解決順: `vars.APPLE_TEAM_ID` → `vars.APP_TEAM_ID` → secrets 同名。  
正規 IPA: `ios/App/build/TiSLY.ipa`

## API キー権限（重要）

キーは **Admin** にしてください。証明書（IOS_DISTRIBUTION）作成に必要です。  
既に Distribution 証明書が **3 つ**ある場合は [Certificates](https://developer.apple.com/account/resources/certificates/list) で未使用を失効させてから再実行してください。

## 任意（証明書作成ができない場合）

| Secret | 内容 |
|--------|------|
| `IOS_DIST_CERT_P12_BASE64` | Apple Distribution `.p12` の base64 |
| `IOS_DIST_CERT_PASSWORD` | その `.p12` のパスワード |

```bash
base64 -i AuthKey_or_dist.p12 | pbcopy   # macOS
# Windows: [Convert]::ToBase64String([IO.File]::ReadAllBytes('dist.p12'))
```

## 実行

Actions → **iOS Build & Deploy (Capacitor)** → Run workflow  

フロー: ASC で Distribution 証明書/プロファイル準備 → Manual 署名で `archive` → `exportArchive`（`method=app-store`）→ IPA 内 `embedded.mobileprovision` 検証 → TestFlight アップロード

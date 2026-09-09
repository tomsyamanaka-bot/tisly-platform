# TiSLY iOS — App Store Connect API / 署名 Secrets

ITMS-90174（プロビジョニングなし）を防ぐため、CI は **Manual Distribution 署名 + 署名付き archive + exportArchive** のみ許可します（未署名 Payload zip 禁止）。

> Xcode 26 の Automatic Signing は GHA 上で CodeSign を飛ばし `code object is not signed at all` になるため、ASC API で証明書・プロファイルを用意して Manual 署名します（`-allowProvisioningUpdates` + API キー認証は必須）。

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

キーは **Admin** にしてください。証明書（IOS_DISTRIBUTION）作成・失効に必要です。  
既に Distribution 証明書が **3 つ**ある場合、CI は最古を失効して枠を空けます（または下記 P12 を設定）。

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

フロー: ASC API で Distribution 証明書（CSR）+ App Store プロファイル作成 → keychain / MobileDevice へ import → **Manual** で `archive`（`-allowProvisioningUpdates`）→ `exportArchive`（`signingStyle=manual` + `provisioningProfiles`）→ IPA 内 `embedded.mobileprovision` 検証 → TestFlight アップロード

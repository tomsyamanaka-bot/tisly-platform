# TiSLY iOS — App Store Connect API / 署名 Secrets

ITMS-90174（プロビジョニングなし）を防ぐため、CI は **Manual Distribution 署名 + 署名付き archive + exportArchive** のみ許可します（未署名 Payload zip 禁止）。

> 証明書の **自動作成（CSR / ASC POST /v1/certificates）は行いません**（Invalid Certificate / 上限 3 / Admin 権限不足を回避）。  
> Apple Distribution の **.p12** と App Store プロファイルを Secrets で渡します。

## 必須

| 種類 | 名前 | 内容 |
|------|------|------|
| Secret | `APP_STORE_KEY_ID` | API Key ID（TestFlight アップロード用） |
| Secret | `APP_STORE_ISSUER_ID` | Issuer ID（UUID） |
| Secret | `APP_STORE_PRIVATE_KEY` | `.p8` 全文 |
| Secret | `IOS_DIST_CERT_P12_BASE64` | Apple Distribution `.p12` の base64 |
| Secret | `IOS_DIST_CERT_PASSWORD` | その `.p12` のパスワード |
| **Variable**（推奨） | `APPLE_TEAM_ID` または `APP_TEAM_ID` | Team ID（10 文字） |

※ Team ID は **Variables** 推奨。解決順: `vars.APPLE_TEAM_ID` → `vars.APP_TEAM_ID` → secrets 同名。  
正規 IPA: `ios/App/build/TiSLY.ipa`

## プロファイル（どちらか）

| 種類 | 名前 | 内容 |
|------|------|------|
| Secret（推奨） | `IOS_PROVISIONING_PROFILE_BASE64` | App Store `.mobileprovision` の base64 |
| （フォールバック） | ASC 既存プロファイル取得 | API キーで **既存** `IOS_APP_STORE` を download（新規作成しない） |

任意: Secret `IOS_PROFILE_NAME`（ExportOptions / `PROVISIONING_PROFILE_SPECIFIER` 上書き。未設定時はプロファイル内 Name）

## .p12 / プロファイルの作り方（macOS）

1. Keychain Access で **Apple Distribution** 証明書を選び、「項目を書き出す」→ `.p12`
2. Apple Developer → Profiles → **App Store** 用（`jp.tisly.app`）をダウンロード → `.mobileprovision`
3. Secrets へ:

```bash
# macOS
base64 -i Distribution.p12 | pbcopy          # → IOS_DIST_CERT_P12_BASE64
base64 -i jp.tisly.app.mobileprovision | pbcopy  # → IOS_PROVISIONING_PROFILE_BASE64

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('Distribution.p12'))
[Convert]::ToBase64String([IO.File]::ReadAllBytes('jp.tisly.app.mobileprovision'))
```

```bash
gh secret set IOS_DIST_CERT_P12_BASE64 < dist.p12.b64.txt
gh secret set IOS_DIST_CERT_PASSWORD
gh secret set IOS_PROVISIONING_PROFILE_BASE64 < profile.b64.txt
```

## 実行

Actions → **iOS Build & Deploy (Capacitor)** → Run workflow  

フロー: P12 を login keychain へ import → 既存 App Store プロファイルを MobileDevice へ配置 → **Manual** で `archive`（`-allowProvisioningUpdates` + ASC API 認証）→ `exportArchive`（`signingStyle=manual` + `provisioningProfiles`）→ IPA 内 `embedded.mobileprovision` 検証 → TestFlight アップロード

# TiSLY iOS — 手動署名 Secrets（p12 / プロファイル）

ITMS-90174 対策のため、CI は **Manual 署名のみ**。
未署名 Payload zip は禁止。

証明書の **自動作成は行いません**
（CSR / ASC POST /v1/certificates 廃止）。
上限3枚・Invalid Certificate・権限不足を回避するため、
GitHub Secrets の p12 とプロファイルを使う。

## 必須 Secrets

| 名前 | 内容 |
|------|------|
| `APP_STORE_KEY_ID` | API Key ID（TestFlight 用） |
| `APP_STORE_ISSUER_ID` | Issuer ID（UUID） |
| `APP_STORE_PRIVATE_KEY` | `.p8` 全文 |
| `IOS_DIST_CERT_P12_BASE64` | Apple Distribution `.p12` の base64 |
| `IOS_DIST_CERT_PASSWORD` | その `.p12` のパスワード |
| `IOS_PROVISIONING_PROFILE_BASE64` | App Store `.mobileprovision` の base64 |

## 必須 Variables

| 名前 | 内容 |
|------|------|
| `APPLE_TEAM_ID`（または `APP_TEAM_ID`） | Team ID（10 文字） |

任意: `IOS_PROFILE_NAME`（プロファイル名の上書き）

正規 IPA: `ios/App/build/TiSLY.ipa`

## 登録手順（macOS）

1. Keychain で Apple Distribution を `.p12` 書き出し
2. Developer から `jp.tisly.app` の
   App Store プロファイルを取得
3. Secrets へ登録:

```bash
base64 -i Distribution.p12 | pbcopy
# → IOS_DIST_CERT_P12_BASE64

base64 -i jp.tisly.app.mobileprovision | pbcopy
# → IOS_PROVISIONING_PROFILE_BASE64

gh secret set IOS_DIST_CERT_P12_BASE64 < dist.b64.txt
gh secret set IOS_DIST_CERT_PASSWORD
gh secret set IOS_PROVISIONING_PROFILE_BASE64 < profile.b64.txt
```

Windows:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('Distribution.p12'))
[Convert]::ToBase64String([IO.File]::ReadAllBytes('app.mobileprovision'))
```

## 実行フロー

Actions → **iOS Build & Deploy (Capacitor)**

1. p12 を login keychain へ import
2. `.mobileprovision` を MobileDevice へ配置
3. `CODE_SIGN_STYLE=Manual` で archive
   （`-allowProvisioningUpdates` + ASC 認証）
4. `exportArchive`（manual + provisioningProfiles）
5. IPA 内 `embedded.mobileprovision` 検証
6. TestFlight アップロード

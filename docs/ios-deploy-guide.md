# TiSLY iOS 自動ビルド＆ App Store Connect デプロイ手順

Windows のみの開発環境でも、**GitHub Actions（`macos-latest`）** 経由で Capacitor iOS をアーカイブし、App Store Connect へアップロードできる構成です。

関連:

- **正規ワークフロー**: [`.github/workflows/ios-build-deploy.yml`](../.github/workflows/ios-build-deploy.yml)
- **ASC API キー 3 件のみ**: [IOS_SECRETS_SETUP.md](./IOS_SECRETS_SETUP.md)（承認待ち中はこちらを先に読む）
- Capacitor 設定: [`capacitor.config.ts`](../capacitor.config.ts)（`appId: jp.tisly.app`）
- Info.plist テンプレ: [`ios-ci/Info.plist.permissions.template.xml`](../ios-ci/Info.plist.permissions.template.xml)
- Android TWA との関係: Android は `com.tisly.app`（Bubblewrap）。iOS は別 Bundle ID `jp.tisly.app`。どちらも本番 URL `https://tisly.jp` を表示（既存 PWA・DB・写真ルールは変更なし）。

---

## 1. 前提（Apple Developer）

1. [Apple Developer Program](https://developer.apple.com) 加入済み
2. Certificates, Identifiers & Profiles で:
   - **App ID**: `jp.tisly.app`（Push Notifications / Associated Domains は必要に応じて有効化）
   - **Distribution 証明書**（Apple Distribution）を作成し、`.p12` で書き出し
   - **App Store 用プロビジョニングプロファイル**（App Store / Distribution）を作成し `.mobileprovision` をダウンロード
3. [App Store Connect](https://appstoreconnect.apple.com) でアプリ新規作成（Bundle ID = `jp.tisly.app`、名前 = TiSLY）
4. **Users and Access → Integrations → App Store Connect API** で API キーを発行（`.p8` を保存。再ダウンロード不可）

---

## 2. GitHub Secrets に登録するもの

Repository → **Settings → Secrets and variables → Actions → New repository secret**

| Secret 名 | 内容 |
|-----------|------|
| `BUILD_CERTIFICATE_BASE64` | Distribution 証明書 `.p12` を Base64 したもの |
| `CERTIFICATE_PASSWORD` | `.p12` のパスワード |
| `BUILD_PROVISION_PROFILE_BASE64` | `.mobileprovision` を Base64 したもの |
| `PROVISIONING_PROFILE_NAME` | プロファイルの**表示名**（例: `TiSLY App Store`）。ExportOptions と一致させる |
| `APPLE_TEAM_ID` | Apple Team ID（10 文字） |
| `APP_STORE_KEY_ID` | App Store Connect API Key ID |
| `APP_STORE_ISSUER_ID` | Issuer ID（UUID） |
| `APP_STORE_PRIVATE_KEY` | `.p8` の**全文**（`-----BEGIN PRIVATE KEY-----` 含む）。改行はそのままで可 |
| `APP_STORE_PRIVATE_KEY_IS_BASE64` | `.p8` を Base64 で入れた場合のみ `1`（平文なら未設定で可） |
| `KEYCHAIN_PASSWORD` | CI 一時キーチェーン用パスワード（任意。未設定時はワークフローが仮パスワードを使用） |

### Base64 の作り方（例）

**macOS / Linux**

```bash
base64 -i AuthKey_XXXXXX.p8 | pbcopy          # またはファイルへ
base64 -i TiSLY_Distribution.p12 | pbcopy
base64 -i TiSLY_AppStore.mobileprovision | pbcopy
```

**Windows PowerShell**

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\TiSLY_Distribution.p12")) | Set-Clipboard
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\TiSLY_AppStore.mobileprovision")) | Set-Clipboard
```

`.p8` は平文のまま `APP_STORE_PRIVATE_KEY` に貼るのが簡単です（Base64 にする場合は `APP_STORE_PRIVATE_KEY_IS_BASE64=1`）。

---

## 3. ワークフローの動かし方

1. GitHub → **Actions → iOS Build & Deploy (Capacitor)** → **Run workflow**
2. 入力:
   - `upload`: App Store Connect / TestFlight へ上げるなら true（IPA のみなら false）
   - `server_url`: 通常は `https://tisly.jp`（ローカル www のみ検証するなら `local`）
3. 成功後:
   - Artifact `TiSLY-ios-ipa` に IPA
   - `upload=true` なら TestFlight 向けにアップロード済み

タグでも起動: `ios-v1.0.0` または `v1.0.0-ios`。

ASC API キー（3 件）だけ先に用意する場合: [IOS_SECRETS_SETUP.md](./IOS_SECRETS_SETUP.md)

---

## 4. ローカル（Windows）でできること

Mac なしでは **Xcode / `cap add ios` は不可**。代わりに:

```bash
npm install
npm run build
npm run cap:prepare          # server/public → www
# npx cap sync ios           # Mac / CI のみ
```

Info.plist 用の権限文言は `scripts/ios-patch-info-plist.mjs` が CI 上で注入します（カメラ・フォト・マイク・ローカルネットワーク・リモート通知）。

---

## 5. Capacitor 構成の要点

| 項目 | 値 |
|------|-----|
| appId | `jp.tisly.app` |
| appName | `TiSLY` |
| webDir | `www`（`npm run cap:prepare` で `server/public` から生成） |
| 本番表示 | `server.url = https://tisly.jp`（Android TWA と同思想） |
| 写真ルール | 変更なし（現調=`survey_photos` / 完了=`completion_photos`） |

---

## 6. トラブルシュート

| 症状 | 確認 |
|------|------|
| Secrets 不足で失敗 | 上記表。ログに不足名が出る |
| 署名エラー | Team ID・プロファイルの Bundle ID が `jp.tisly.app` か / 証明書の種類が Distribution か |
| Fastlane upload 失敗 | API Key の権限（App Manager 以上）・Issuer ID・Key ID |
| カメラ権限ダイアログが出ない | CI の `ios:patch-plist` ステップ成功を確認 |
| 既存 VPS デプロイへの影響 | 本 WF は `ios-deploy.yml` のみ。`deploy-vps.yml` とは独立 |

VPS 本番の確認は従来どおり https://tisly.jp/api/health の `commitShort` です（iOS WF 成功だけでは VPS は更新されません。`master` push 時の VPS Auto Deploy を利用）。

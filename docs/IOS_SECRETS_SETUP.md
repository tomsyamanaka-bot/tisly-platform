# TiSLY iOS — App Store Connect API キー（GitHub Secrets）登録手順

手元 Mac / `.p12` / `BUILD_CERTIFICATE_*` / プロビジョニングプロファイルは**一切不要**です。

必須 Secrets は次の **3 つだけ**です。

| Secret 名 | 中身 |
|-----------|------|
| `APP_STORE_KEY_ID` | API Key の Key ID |
| `APP_STORE_ISSUER_ID` | Issuer ID（UUID） |
| `APP_STORE_PRIVATE_KEY` | `.p8` 秘密鍵の全文 |

加えて（証明書ではない・公開情報）:

| 種類 | 名前 | 中身 |
|------|------|------|
| **Actions Variable**（推奨） | `APPLE_TEAM_ID` | Apple Team ID（10 文字） |

Team ID は Settings → Secrets and variables → **Variables** に登録してください（Secret でも可だが秘密ではありません）。  
確認場所: App Store Connect → ユーザとアクセス、または [developer.apple.com](https://developer.apple.com/account) → Membership。

CI: [`.github/workflows/ios-build-deploy.yml`](../.github/workflows/ios-build-deploy.yml)  
署名方式: Xcode Automatic + ASC API 認証キー（`-allowProvisioningUpdates`）。CI が証明書をクラウド側で解決します。

---

## 1. API キー発行

1. [App Store Connect](https://appstoreconnect.apple.com) → **ユーザとアクセス** → **統合** → **App Store Connect API**
2. キー生成（**Admin** 推奨）
3. Issuer ID / Key ID を控える
4. `.p8` をダウンロード（再取得不可）

---

## 2. GitHub 登録

**Secrets（3）**

- `APP_STORE_KEY_ID`
- `APP_STORE_ISSUER_ID`
- `APP_STORE_PRIVATE_KEY`（PEM 全文。改行そのままで可）

**Variables（1・推奨）**

- `APPLE_TEAM_ID` = 10 文字の Team ID

~~登録しないでよいもの~~: `BUILD_CERTIFICATE_BASE64`, `CERTIFICATE_PASSWORD`, `BUILD_PROVISION_PROFILE_BASE64`, `PROVISIONING_PROFILE_NAME`, `KEYCHAIN_PASSWORD`

---

## 3. 実行

Actions → **iOS Build & Deploy (Capacitor)** → Run workflow  
初回は `upload: false` 推奨。

不足時のエラーは必ず `APP_STORE_*` または `APPLE_TEAM_ID` の名前です。`BUILD_CERTIFICATE_*` は要求しません。

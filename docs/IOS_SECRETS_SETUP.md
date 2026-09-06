# TiSLY iOS — App Store Connect API キー（GitHub Secrets）登録手順

手元に Mac / `.p12` / プロビジョニングプロファイルは**不要**です。  
CI（`macos-latest`）が Fastlane `cert` / `sigh` で署名資材を自動取得し、TestFlight へアップロードします。

必須 Secrets は次の **3 つだけ**です。

| Secret 名 | 中身 |
|-----------|------|
| `APP_STORE_KEY_ID` | API Key の Key ID（例: `AB12CD34EF`） |
| `APP_STORE_ISSUER_ID` | Issuer ID（UUID 形式） |
| `APP_STORE_PRIVATE_KEY` | ダウンロードした `.p8` 秘密鍵の全文 |

任意（推奨）:

| Secret 名 | 中身 |
|-----------|------|
| `APPLE_TEAM_ID` | Apple Team ID（10 文字）。未設定でも多くの場合 Fastlane が API キーから解決 |

CI ワークフロー: [`.github/workflows/ios-build-deploy.yml`](../.github/workflows/ios-build-deploy.yml)

---

## 1. App Store Connect で API キーを発行

1. [App Store Connect](https://appstoreconnect.apple.com) にログイン
2. **ユーザとアクセス** → **統合**（Integrations）→ **App Store Connect API**
3. **キーを生成**（権限は **Admin** または **App Manager** 推奨 ※証明書自動作成のため）
4. 控える値:
   - **Issuer ID** → `APP_STORE_ISSUER_ID`
   - **キー ID** → `APP_STORE_KEY_ID`
5. **API キーをダウンロード** → `AuthKey_XXXXXXXXXX.p8`（再ダウンロード不可）

---

## 2. GitHub に Secrets を登録

1. リポジトリ → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** で 3 件を登録:

### `APP_STORE_KEY_ID`

Key ID のみ（例: `AB12CD34EF`）

### `APP_STORE_ISSUER_ID`

Issuer ID（UUID）全文

### `APP_STORE_PRIVATE_KEY`

`.p8` の全文（改行そのままで可）:

```
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

（Base64 で入れる場合のみ `APP_STORE_PRIVATE_KEY_IS_BASE64=1` も設定）

---

## 3. 動作確認

1. Actions → **iOS Build & Deploy (Capacitor)** → **Run workflow**
2. 初回は `upload: false` で IPA 生成を確認してから `upload: true`
3. 不足がある場合、ジョブ先頭で `APP_STORE_*` の名前付きエラーが出ます（`.p12` 系は要求しません）

---

## 注意

- `.p8` を git / チャットにコミットしない
- 既存 VPS デプロイ・本番 DB・PWA とは独立
- Bundle ID: `jp.tisly.app`（App Store Connect にアプリを作成済みであること）
- Distribution 証明書の上限（通常 3 枚）に達している場合は、不要な証明書を Apple Developer で整理してください（CI が新規作成するとき）

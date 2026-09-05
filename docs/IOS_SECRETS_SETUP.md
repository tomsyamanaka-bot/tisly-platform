# TiSLY iOS — App Store Connect API キー（GitHub Secrets）登録手順

Apple Developer Program の**承認完了後**に実施してください（現在が承認待ちなら、承認メールが来てからで十分です）。

このドキュメントは次の **3 つの Secrets** だけを扱います。署名用証明書などの全体手順は [ios-deploy-guide.md](./ios-deploy-guide.md) を参照。

| Secret 名 | 中身 |
|-----------|------|
| `APP_STORE_KEY_ID` | API Key の Key ID（例: `AB12CD34EF`） |
| `APP_STORE_ISSUER_ID` | Issuer ID（UUID 形式） |
| `APP_STORE_PRIVATE_KEY` | ダウンロードした `.p8` 秘密鍵の全文 |

CI ワークフロー: [`.github/workflows/ios-build-deploy.yml`](../.github/workflows/ios-build-deploy.yml)

---

## 1. App Store Connect で API キーを発行

1. [App Store Connect](https://appstoreconnect.apple.com) にログイン
2. **ユーザとアクセス** → **統合**（Integrations）→ **App Store Connect API**
3. **キーを生成**（Team 権限は **App Manager** 以上を推奨）
4. 表示される値を控える:
   - **Issuer ID**（ページ上部）→ 後で `APP_STORE_ISSUER_ID`
   - **キー ID** → 後で `APP_STORE_KEY_ID`
5. **API キーをダウンロード** → `AuthKey_XXXXXXXXXX.p8`  
   ※ **一度きり**。紛失したらキーを失効して再発行

---

## 2. GitHub に Secrets を登録

1. GitHub リポジトリを開く
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret** を 3 回実行:

### `APP_STORE_KEY_ID`

- Value: Key ID のみ（例: `AB12CD34EF`）

### `APP_STORE_ISSUER_ID`

- Value: Issuer ID の UUID 全文

### `APP_STORE_PRIVATE_KEY`

- Value: `.p8` ファイルの**全文**（次の形式をそのまま貼り付け）

```
-----BEGIN PRIVATE KEY-----
...複数行...
-----END PRIVATE KEY-----
```

改行はそのままで問題ありません。  
（Base64 で入れる場合は別 Secret `APP_STORE_PRIVATE_KEY_IS_BASE64=1` も設定。通常は平文で十分）

---

## 3. 動作確認（承認後）

1. Actions → **iOS Build & Deploy (Capacitor)** → **Run workflow**
2. 初回は `upload: false` で IPA 生成だけ試し、Secrets・証明書が揃ってから `upload: true`
3. 不足 Secret がある場合、ジョブ先頭で名前付きエラーが出ます

---

## 注意

- `.p8` / Key ID / Issuer ID を git やチャットにコミット・貼付しない
- 既存の VPS デプロイ（`deploy-vps.yml`）・本番 DB・PWA とは独立（この 3 キー登録だけでは本番サイトは変わりません）
- Bundle ID は `jp.tisly.app`（App Store Connect 側のアプリ作成も承認後に実施）

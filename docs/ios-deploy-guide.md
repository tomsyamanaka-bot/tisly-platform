# TiSLY iOS 自動ビルド＆ App Store Connect デプロイ手順

Windows のみでも GitHub Actions（`macos-latest`）で IPA を作り TestFlight へ上げられます。

**構成:** Capacitor + **xcodebuild**（Automatic Signing）+ ASC API キー。**Fastlane は使いません。**

- 正規 WF: [`.github/workflows/ios-build-deploy.yml`](../.github/workflows/ios-build-deploy.yml)
- Secrets 手順: [IOS_SECRETS_SETUP.md](./IOS_SECRETS_SETUP.md)
- Capacitor: `capacitor.config.ts`（`jp.tisly.app`）

既存 PWA（`/app` `/customer`）・VPS・DB・写真ルールは変更しません。

---

## 必要な GitHub 設定

| 名前 | 種類 | 内容 |
|------|------|------|
| `APP_STORE_KEY_ID` | Secret | API Key ID |
| `APP_STORE_ISSUER_ID` | Secret | Issuer ID |
| `APP_STORE_PRIVATE_KEY` | Secret | `.p8` 全文 |
| `APPLE_TEAM_ID` | Variable | Team ID（10 文字） |

---

## 実行

1. Actions → **iOS Build & Deploy (Capacitor)** → Run workflow
2. 成功時: Artifact `TiSLY-ios-ipa`、および `upload=true` なら App Store Connect へアップロード

タグ: `ios-v*` / `v*-ios`

---

## ローカル（Windows）

```bash
npm install
npm run build
npm run cap:prepare
npm run ios:check
```

---

## トラブルシュート

| 症状 | 確認 |
|------|------|
| Secrets 不足 | `APP_STORE_*` 3 件 |
| Team ID 不足 | Variables の `APPLE_TEAM_ID` |
| 署名失敗 | App ID `jp.tisly.app` が Developer にあるか / API キー権限が Admin か |
| VPS 影響なし | 本 WF は `deploy-vps.yml` と独立 |

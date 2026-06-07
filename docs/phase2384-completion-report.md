# Phase 2384 — Gmail 実送信確認 完了レポート

**日時:** 2026-06-07  
**対象:** https://tisly.jp（ConoHa VPS 本番）

---

## 1. 本番状態（test-email 実行前）

| 項目 | 結果 |
|------|------|
| `/api/health` | `status: ok` · DB ok · WebSocket ok |
| `production-check` phase | **2383**（VPS 現行デプロイ） |
| `adminPasswordStatus` | **GREEN** |
| `operationalReady` | **true** |
| `productionRatePercent` | **100%** |
| `gmailMode` | **real** |
| `smtpConfigured` | **true** |
| `notificationTestToConfigured` | **true** |
| `lastSendStatus` | **なし**（未送信） |
| App Hub Gmail カード | **GREEN — Gmail SMTP ready** |

---

## 2. test-email API 実行手順

### PowerShell（推奨・一括）

```powershell
cd C:\Users\yaman\TiSLY_HOME_Security_DEMO
.\scripts\phase2384-gmail-verify.ps1 -AdminPassword 'あなたの管理者パスワード'
```

パスワードを対話入力する場合:

```powershell
$sec = Read-Host "管理者パスワード" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
.\scripts\phase2384-gmail-verify.ps1 -AdminPassword $pass
```

### curl（Linux / VPS）

```bash
TOKEN=$(curl -s -X POST https://tisly.jp/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"あなたの強力なパスワード"}' \
  | jq -r .token)

curl -s -X POST https://tisly.jp/api/notifications/test-email \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### App Hub（ブラウザ）

1. https://tisly.jp/app を開く
2. 「Gmail通知テスト」カードで **GREEN — Gmail SMTP ready** を確認
3. **テスト送信** をクリック
4. プロンプトに `admin` / 管理者パスワードを入力
5. 結果に `送信成功（logId=...）` が表示されること

---

## 3. App Hub「Gmail通知テスト」

| 確認項目 | 結果 |
|----------|------|
| カード表示 | ✅ |
| バッジ | GREEN — Gmail SMTP ready |
| `gmailMode=real` | ✅ |
| SMTP マスク表示 | `SMTP_USER=toms.t.yamanaka@gmail.com / SMTP_PASS=****` |
| テスト送信ボタン | 有効（disabled ではない） |
| 送信実行 | ✅ 完了（2026-06-07 04:08:46 UTC） |

---

## 4. Gmail 送信結果

| 項目 | 期待値 | 結果 |
|------|--------|------|
| `POST /api/notifications/test-email` | HTTP 200 | ✅ |
| レスポンス `ok` | `true` | ✅ |
| レスポンス `mock` | `false`（real モード） | ✅ |
| `logId` | UUID 形式 | ✅ |
| `lastSendStatus.status` | `sent` | ✅ |
| 件名 | `[TiSLY] Gmail 通知テスト` | ✅ |

---

## 5. 受信メール確認項目

`NOTIFICATION_TEST_TO` に設定された宛先の受信トレイ（および迷惑メール）で以下を確認:

| # | 確認項目 | ☐ |
|---|----------|---|
| 1 | 件名が `[TiSLY] Gmail 通知テスト` である | ✅ |
| 2 | 差出人が `SMTP_USER`（toms.t.yamanaka@gmail.com）である | ✅ |
| 3 | 本文に「TiSLY Gmail 通知テストメールです。」が含まれる | ✅ |
| 4 | 本文に送信時刻（ISO 8601）が含まれる | ✅ |
| 5 | 本文に `モード: real` が含まれる | ✅ |
| 6 | 本文にマスク済み SMTP 情報が含まれる | ✅ |
| 7 | 迷惑メールフォルダに振り分けられていない | ✅ |
| 8 | 数分以内に届いている（遅延なし） | ✅ |

---

## 6. production-check 再実行（test-email 後）

```powershell
Invoke-RestMethod https://tisly.jp/api/deploy/production-check |
  Select-Object phase, adminPasswordStatus, operationalReady, gmailMode, smtpConfigured, lastSendStatus, productionRatePercent |
  ConvertTo-Json
```

**VPS 現行（phase 2383）:** `lastSendStatus.status=sent` で Gmail インフラ GREEN を維持。

**次回デプロイ後（phase 2384）:** 追加チェック `gmail-test-email-sent` / `gmail-real-send-verified` が production-check に含まれる。

---

## 7. Phase 2384 完了判定

| 条件 | 状態 |
|------|------|
| VPS health check | ✅ 完了（ユーザー報告） |
| admin ログイン可能 | ✅ GREEN |
| Gmail SMTP 準備 | ✅ real + configured |
| test-email 実行 | ✅ |
| 受信メール確認 | ✅（ユーザー確認 2026-06-07） |
| production-check 再実行 | ✅ `lastSendStatus=sent` · `productionRatePercent=100` |

**Phase 2384 完了:** ✅ test-email `ok:true` + `lastSendStatus=sent` + 受信メール確認済み

---

## リポジトリ変更（次回デプロイ用）

- `server/src/deploy/phase2384-production-check.ts` — 実送信確認チェック追加
- `GET /api/deploy/production-check` → phase **2384**
- `GET /api/deploy/production-check-2383` — レガシー
- `scripts/phase2384-gmail-verify.ps1` / `.sh`

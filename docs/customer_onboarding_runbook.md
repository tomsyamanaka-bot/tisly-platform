# 顧客オンボーディング Runbook（Phase 1071–1080）

## 目的

顧客作成 → 現場作成 → デバイス登録 → QR 発行 → 施工チェックリスト生成を一括化し、  
施工員が迷わず現場登録できる状態を作る。

## 手順（推奨フロー）

### 1. 管理者ログイン

ダッシュボードまたは API で admin JWT を取得。

### 2. 新規導入ウィザードを開く

```
/onboarding/new
```

### 3. ウィザード入力

| ステップ | 入力項目 |
|---------|---------|
| 1. 顧客 | 顧客名、顧客コード（任意）、プラン |
| 2. 現場 | 現場名、住所、現場種別（戸建/民泊/工場等） |
| 3. 設備 | ESP・Shelly 等（最低1台） |
| 4. 確認 | 一括登録 |

### 4. API 一括登録（代替）

```bash
POST /api/customer-onboarding/create
Authorization: Bearer <admin-token>
```

```json
{
  "customerName": "株式会社トムズ設備",
  "customerCode": "TOMS010",
  "siteName": "つくば本社",
  "plan": "PRO_REMOTE",
  "address": "茨城県つくば市",
  "siteType": "kodate",
  "devices": [
    { "name": "リビングESP", "location": "1F リビング", "kind": "ESP" },
    { "name": "電源盤Shelly", "location": "1F 電源盤", "kind": "Shelly" }
  ]
}
```

### 5. 出力の確認

| フィールド | 用途 |
|-----------|------|
| `customer.initialPassword` | 顧客オーナー初回ログイン |
| `qrLinks` | 資産 QR ページ URL |
| `checklistUrl` | 導入チェックリスト |
| `deployUrl` | 導入管理（保守・引渡し） |
| `installUrl` | 施工員 PWA ホーム |

### 6. 施工員 PWA で現場作業

```
/customer/{code}/install/home
```

上から順に:

1. 今日の作業 / 未完了カードを確認
2. MQTT test-heartbeat（mock 可）
3. Shelly 登録確認
4. 施工チェックリスト 8 項目を「済」に更新
5. 施工前・施工後写真
6. 完了レポート

### 7. 導入完了

`/deployment/checklist?customerCode={code}` で全項目確認後、導入完了マーク。

## オフライン対応

施工チェックリストの手動更新はオフライン時ローカルキューに保存され、  
オンライン復帰時に `POST /api/customer/:code/install/sync` で同期（action: `field_checklist_update`）。

## 既存ルートとの関係

| 既存 | 本 Phase |
|------|---------|
| `/customer/new` | 顧客のみ登録（従来通り） |
| `/site/new` | 現場のみ作成 |
| `/device/provision` | 設備のみ登録 |
| `/onboarding/new` | **一括化（新規）** |

## トラブルシュート

| 症状 | 対処 |
|------|------|
| MQTT未確認が残る | `POST /api/deployment/mqtt/test-heartbeat` |
| Shelly未確認が残る | `POST /api/shelly/test` または register 再実行 |
| チェックリストが同期されない | 施工 PWA「同期」ボタン |
| 顧客コード重複 | 別コードを指定するか自動採番に任せる |

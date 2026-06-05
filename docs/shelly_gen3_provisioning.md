# Shelly Gen3 プロビジョニング（Phase 1051–1060）

## 概要

Shelly Gen3/Plus を TiSLY の遠隔電源装置として登録する。  
mock 時は成功レスポンスを返し、real 時は `SHELLY_BASE_URL` へ RPC を投げる構造。

## 環境変数

| 変数 | 説明 | 既定 |
|------|------|------|
| `SHELLY_MODE` | `mock` または `real` | `mock` |
| `SHELLY_BASE_URL` | 実機 HTTP ベース URL（例 `http://192.168.1.50`） | — |
| `SHELLY_AUTH_TOKEN` | Bearer トークン（画面・ログに出力しない） | — |

### mock モード

```env
SHELLY_MODE=mock
```

- `GET /api/shelly/status` → online=true, mock=true
- `POST /api/shelly/register` → デバイス + QR 資産を DB 登録
- `POST /api/shelly/test` → 成功レスポンス

### real モード

```env
SHELLY_MODE=real
SHELLY_BASE_URL=http://192.168.1.50
SHELLY_AUTH_TOKEN=<secret>
```

- `Shelly.GetStatus` RPC で接続確認
- `POST /api/shelly/reboot` は `confirm:true` 必須

## API

### GET /api/shelly/status

`provisioning` フィールドに Phase 1051–1060 情報を含む。

### POST /api/shelly/register

認証: admin JWT

```json
{
  "customerCode": "TOMS002",
  "siteId": "site-abc",
  "name": "遠隔電源",
  "location": "1F 電源盤",
  "baseUrl": "http://192.168.1.50"
}
```

- `devices` テーブルに `device_type=shelly` で登録
- `deployment_assets` に QR 資産作成
- 導入チェックリスト `shelly` 項目を自動 ON

### POST /api/shelly/test

```json
{
  "customerCode": "TOMS002",
  "deviceId": "TOMS002-SHELLY-ABC123",
  "baseUrl": "http://192.168.1.50"
}
```

### POST /api/shelly/reboot

既存 API。real 時は `confirm:true` または `dryRun:true` 必須。

## 営業デモチェックリスト連携

`/api/demo-kit/sales/checklist` の Shelly 項目は本 API と `SHELLY_MODE` を参照。  
施工 PWA の「Shelly未確認」カードは `GET /api/customer/:code/install/home-cards` で集計。

## 運用手順

1. 顧客オンボーディングで Shelly 設備を含める、または `POST /api/shelly/register`
2. mock で登録・テスト成功を確認
3. 現場で Shelly の IP を取得し `SHELLY_BASE_URL` を設定
4. `SHELLY_MODE=real` に切替して `POST /api/shelly/test` で実機確認
5. 施工チェックリスト「Shelly登録」を「済」に更新

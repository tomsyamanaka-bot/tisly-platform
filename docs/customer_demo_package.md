# Customer Demo Package（Phase 907）

## テンプレ

| type | ラベル | 顧客コード |
|------|--------|------------|
| house | 戸建て | TOMS001 |
| minpaku | 民泊 | MINPAKU-DEMO |
| factory | 工場 | FACTORY-DEMO |
| warehouse | 倉庫 | FACTORY-DEMO |
| care | 介護 | TISLY-DEMO |

## 起動

`POST /api/demo-kit/demo-packages/:type/launch`

- デモキット初期化
- `deviceMode` をテンプレに合わせて設定
- 代表イベント（侵入 / ESP 異常 / 保守通知）を 1 件発火

## 営業 UI

`/sales` — 「ワンクリックデモ（業種テンプレ）」ボタン

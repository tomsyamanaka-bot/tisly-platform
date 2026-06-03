# 現場セットアップ Runbook

## 事前（オフィス）

1. 顧客ポータルで契約・プラン確認（PRO_REMOTE）
2. `POST /api/customers/wizard` またはポータルで現場骨格作成
3. 図面 PNG を `floors/upload` で登録

## 現場（スマホ PWA）

1. `/customer/{CODE}/install` に **installer** でログイン
2. 現場・フロア選択
3. QR 発行 → 機器貼付 → claim
4. Map Editor で配置（スナップ ON）
5. 疎通テスト 4 種
6. MQTT 診断で topic 確認
7. チェックリスト完了 → 完了レポート URL を営業へ共有

## デモ顧客

| Code | ユーザー | パスワード |
|------|----------|------------|
| TOMS001 | toms001.installer | CUSTOMER_DEMO_PASSWORD |
| HOTEL001 | hotel001.installer | 同上 |
| PLANT001 | plant001.installer | 同上 |

## トラブル

| 症状 | 対処 |
|------|------|
| QR expired | 再発行 create |
| QR already used | 新 serial で新 QR |
| 403 plan | PRO_REMOTE へアップグレード |
| billing 見えない | installer 正常動作 |

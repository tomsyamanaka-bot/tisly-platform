# 現場セットアップ Runbook

## 事前（オフィス）

1. 顧客ポータルで契約・プラン確認（PRO_REMOTE）
2. `POST /api/customers/wizard` またはポータルで現場骨格作成
3. 図面 PNG を `floors/upload` で登録

## 現場（スマホ PWA）

1. `/customer/{CODE}/install` に **installer** でログイン
2. 現場・フロア選択 — **施工セッション開始**（任意）
3. QR: **カメラスキャン** または発行 → claim（オフライン時は後で同期）
4. NFC: Web NFC または UID 手入力 → claim
5. Map Editor で配置（スナップ・グリッド・Undo/Redo）
6. 疎通テスト 4 種 + **MQTT RTT**
7. チェックリスト完了 → 完了レポート HTML/PDF（`export_id` 付き）
8. ラベル CSV / SVG をテプラ等へ

### 営業デモ

- PWA **ドライラン** ON — 画面上部に `DRY RUN` 表示、DB 未更新

### オフライン

- キュー保存 → 復帰後 **オフラインキュー同期**

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

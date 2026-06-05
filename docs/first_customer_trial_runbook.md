# First Customer Trial Runbook — Phase 1161–1200

初回顧客導入トライアルの手順書です。

## 1. 案件作成

1. `/field/new` を開く
2. 顧客名・住所・建物種別・プラン・現調担当・予定日を入力
3. 作成 → Survey / Business / Timeline が同時生成される

## 2. 現調 → AI → 見積

1. 現調PWA `/survey` で写真・図面・GPS・手書きを登録
2. `POST /api/ai/survey-analysis-v2` で実務寄り候補を取得
3. Business `/business/projects/:id/estimate-draft` でドラフト生成・編集

## 3. 施工・チェックリスト

1. 施工PWA `/customer/:code/install/home`
2. `/deployment/checklist/:projectId` で11項目を完了
3. MQTT・TV・PRO Remote・顧客ポータルを順に確認

## 4. 引渡し

1. `/customer/:code/handover` で引渡しパッケージを確認
2. 設備一覧・QR・施工写真・保守予定・緊急連絡先を顧客へ共有

## 5. 運用監視

1. PRO Remote `/customer/:code/pro-remote` — 外周/1F/2F、異常時自動スクロール
2. Google TV `/tv/:code` — センサー反応時10秒カメラ拡大

## 検証コマンド

```bash
cd server && npm run build && npx tsc --noEmit && npm run test
```

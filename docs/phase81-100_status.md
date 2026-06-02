# Phase 81–100 実装ステータス

## 実装済み

- AI Analytics Engine（分類・リスク・トレンド・サマリー・自然言語レポート）
- Recovery Engine（ルール・デバイス別復旧・エスカレーション・タイムライン・Playbook）
- SLA Monitor / MTTR 算出
- QNAP 連携基盤（ローカル JSON/CSV アーカイブ、日/週/月バックアップ、顧客週報/月報）
- API: `/api/analytics` `/api/recovery` `/api/qnap` `/api/ops/soc|noc`
- UI: `/analytics` `/sales`、運用コンソール SOC/NOC 連携
- 通知連携: AI 優先度による severity・タイトル調整
- デモ連携: `emitDemoEvent` → `processEvent` → Analytics + Recovery
- Google TV: Risk / Critical カード
- ドキュメント 4 種 + README 更新

## 未実装（本番前）

- OpenAI / Ollama によるレポート生成
- QNAP NAS SMB/API 実接続
- H.View / Reolink カメラアーカイブ実装
- Camera AI / Weather API
- Excel xlsx 直接出力（現状 CSV 互換）
- PostgreSQL マイグレーション
- SOC/NOC 専用独立ページ（現状 Operations 内切替）

## 営業で見せられる内容

1. `npm run demo` → 30 秒イベント
2. `/sales` — AI 自然言語インサイト
3. `/analytics` — Risk / Trend / Recovery / Incident / SLA
4. `/operations` — SOC/NOC 切替、マップ・Alarm
5. Google TV — AI Risk / Critical
6. 通知センター — 【重大】【警報】プレフィックス付き通知

## 本番前に必要なこと

- VAPID / Discord / SMTP 本番設定
- QNAP_HOST・認証情報
- systemd + nginx（`docs/vps_production_deploy.md`）
- 実機 MQTT / Node-RED ingest 検証
- Recovery 自動実行の現場 PoC（PLC Builder RECOVERY_CONFIG との統合）

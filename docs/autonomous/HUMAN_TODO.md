# 智紀さんの ToDo（短く）

## 本番前に必須

1. **Gmail アプリパスワード** を `.env` に設定 → App Hub でテスト送信
2. **VAPID 鍵** を生成（`cd server && npm run vapid:setup`）
3. **JWT_SECRET** を本番用に再生成
4. **CUSTOMER_DEMO_PASSWORD** を本番では変更 or 無効化

## できれば早め

5. TOMS 標準フォーマット仕様書の共有 → AI 見積 API 接続設計
6. Google Calendar OAuth（Business カレンダー連携を使う場合）
7. VPS デプロイ確認（`scripts/deploy.sh`）

## 確認してほしい画面

- `/app` — 実務アプリのカードが見やすいか
- `/survey-v1` — 現場で片手操作しやすいか
- `/estimate-v1` — 見積の流れがわかりやすいか

## やらなくていい（Cursor が進める）

- 自走管理ドキュメントの更新
- 仮データでの UI 改善
- 単体テストの実行

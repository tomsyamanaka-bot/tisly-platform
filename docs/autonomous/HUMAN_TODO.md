# 智紀さんの ToDo（短く）

## 今すぐ（本番反映）

1. **VPSへデプロイ**（SSHできる端末から）
   ```bash
   cd /opt/tisly
   git pull origin master
   cd server
   npm run build
   sudo systemctl restart tisly-server
   sudo systemctl status tisly-server
   ```
2. 下記URLを **iPhone Safari** で開いて確認（手順は下記）

## 本番前に必須

3. **Gmail アプリパスワード** を `.env` に設定 → App Hub でテスト送信
4. **VAPID 鍵** を生成（`cd server && npm run vapid:setup`）
5. **JWT_SECRET** を本番用に再生成
6. **CUSTOMER_DEMO_PASSWORD** を本番では変更 or 無効化

## できれば早め

7. TOMS 標準フォーマット仕様書の共有 → 見積エクスポート本番接続
8. Google Calendar OAuth（Business カレンダー連携を使う場合）

## スマホで確認してほしい（実務 PWA）

### ログイン

- 会社コード `TOMS001`、surveyor ユーザーで `/app` にログイン

### 確認の順番

1. `/app` — 「今日使うアプリ」に **現調する**・**見積を作る** の大きいカード
2. 下部ナビで **現調** → **見積** → **アプリ一覧** と移動
3. `/survey-v1` — **新しい現調を作る** → 電話・住所・メモ → 部材カード選択 → **見積へ送る**
4. `/estimate-v1` — **見積待ち一覧** → 案件タップ → 項目名・数量・単価 → **見積を確定** → **PDFプレビュー**
5. **TOMS形式で確認** が開くか
6. 上部 **戻る** / **進む** / 🏠 が使えるか

### iPhone ホーム画面に追加（Safari）

| URL | 見え方 |
|-----|--------|
| `/app` | 業務アプリ一覧 |
| `/survey-v1` | 現調専用（緑） |
| `/estimate-v1` | 見積専用（青） |

**チェック**

- [ ] ボタンが指で押しやすいか
- [ ] 文字だらけになっていないか（カード中心か）
- [ ] 専門用語が見当たらないか
- [ ] スタンドアロン起動でログインが維持されるか

## やらなくていい（Cursor が進める）

- 自走管理ドキュメントの更新
- UI改善・単体テスト

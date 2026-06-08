# 智紀さんの ToDo（短く）

## 🔴 最優先 — VPS 本番反映（未完了）

コードは `origin/master`（`29d58cf`）に push 済み。  
**本番はまだ `d721f45` のまま** — Schedule / v1 API / 新ナビは動いていません。

### 方法A: SSH（推奨）

自宅PC・スマホターミナルなど **SSH が通る端末** から:

```bash
ssh ユーザー名@tisly.jp
cd /opt/tisly
git fetch origin
git pull origin master
cd server
npm run build
sudo systemctl restart tisly-server
sudo systemctl status tisly-server --no-pager
```

**成功の目安**

- `git log -1 --oneline` が `29d58cf` 付近
- `npm run build` エラーなし
- `systemctl status` が `active (running)`
- `curl -s https://tisly.jp/api/health | grep commitShort` が新コミット

### 方法B: ConoHa VNC コンソール

Cursor から SSH タイムアウト時は [ConoHa CP](https://cp.conoha.jp/) → VPS → **VNCコンソール** で上記と同じコマンド。

### 反映直後 — curl 確認（ログイン付き）

```bash
# ログイン（パスワードは本番 .env の CUSTOMER_DEMO_PASSWORD）
TOKEN=$(curl -s -X POST https://tisly.jp/api/auth/customer/login \
  -H "Content-Type: application/json" \
  -d '{"customerCode":"TOMS001","username":"toms001.surveyor","password":"＜パスワード＞"}' \
  | jq -r .token)

# 各 API が 200 になること
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://tisly.jp/api/schedule/v1/week?offset=0"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://tisly.jp/api/schedule/v1/three-weeks?offset=0"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://tisly.jp/api/schedule/v1/month?year=2026&month=6"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://tisly.jp/api/schedule/v1/summary?range=week"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://tisly.jp/api/survey/v1"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://tisly.jp/api/estimate/v1"

# ページ
curl -I https://tisly.jp/schedule-v1   # 200
curl -I https://tisly.jp/survey-v1   # 200
curl -I https://tisly.jp/estimate-v1 # 200
curl -I https://tisly.jp/app         # 200
```

未ログイン時は API が **401**（正常）。PWA では「ログインが切れました」と表示されます。

---

## iPhone 実機確認（デプロイ後）

**Safari** で https://tisly.jp/app にログインしてから確認。

### 下部ナビ

- [ ] 順番: **日程調整 → 現調 → 見積 → 請求 → 案件一覧**
- [ ] 各タブで画面が切り替わる（請求は見積と同じ `/estimate-v1`）

### 日程調整（/schedule-v1）

- [ ] 週間カードに空き度（★）と件数
- [ ] ＜ 今週 ＞ で前週・来週
- [ ] 3週間モードが読みやすい
- [ ] 月間でカテゴリ色（🟫🟦🟩🟥）
- [ ] 現場不可日の登録・解除

### 現調（/survey-v1）

- [ ] **カメラで撮る** / **写真を選ぶ**（複数枚）
- [ ] 選択直後プレビュー、保存後も残る

### 見積（/estimate-v1）

- [ ] **＋ 項目を追加** で複数行
- [ ] 見積番号 `YYMMDD-001` 形式
- [ ] **PDFプレビュー** が 401 にならない
- [ ] 写真あり / 写真なし の見積 PDF を開ける

### ログイン切れ

- [ ] トークン期限切れ時「ログインが切れました」と分かる表示

### ホーム画面に追加（任意）

Safari → 共有 → **ホーム画面に追加**（`/app` 推奨）

---

## 本番前に必須（セキュリティ）

3. **Gmail アプリパスワード** を `.env` に設定
4. **VAPID 鍵**（`cd server && npm run vapid:setup`）
5. **JWT_SECRET** 本番用再生成
6. **CUSTOMER_DEMO_PASSWORD** 本番では変更 or 無効化

## 外部サービス（人間が取得・設定）

| 項目 | キー要否 | 環境変数 | 備考 |
|------|----------|----------|------|
| Google Calendar API | 要 | `GOOGLE_CALENDAR_CLIENT_ID` 等 | 日程の本データ |
| Google Maps API | 要 | `GOOGLE_MAPS_API_KEY` | 配車表の所要時間 |
| Open-Meteo | **不要** | `OPEN_METEO_LIVE=1` で有効化 | 天気予報 |
| Gmail SMTP | 要 | `SMTP_USER` / `SMTP_PASS` | 見積メール送信 |
| VAPID | 要 | `VAPID_PUBLIC_KEY` 等 | Web Push |
| JWT_SECRET | 要 | `JWT_SECRET` | 本番は再生成 |
| 本番管理者パスワード | 要 | `ADMIN_PASSWORD_HASH` | デモパスワード変更 |
| TOMS標準フォーマット | — | — | Excel 仕様書の共有・本接続 |
| PDF印影画像 | — | `TOMS_LOGO_URL` 等 | 本番用印影・ロゴ差し替え |

`.env.example` に仮値を記載済み。取得後は本番 `.env` にのみ設定（コミットしない）。

## できれば早め

- TOMS 標準フォーマット仕様書の共有
- 阿見リフォーム見積の実データ検証（営業と一緒に）

## やらなくていい（Cursor が進める）

- 自走管理ドキュメントの更新
- UI改善・単体テスト

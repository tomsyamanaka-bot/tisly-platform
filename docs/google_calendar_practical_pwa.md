# Google Calendar 本接続（日程調整 PWA）

日程調整（`/schedule-v1`）と連携設定（`/google-calendar-settings-v1`）から Google カレンダーの予定を双方向同期する手順です。

## Google Cloud Console 設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成または選択
2. **API とサービス → ライブラリ** で **Google Calendar API** を有効化
3. **API とサービス → OAuth 同意画面**
   - ユーザータイプ: 外部（テスト時はテストユーザーに自分の Gmail を追加）
   - スコープ: `.../auth/calendar`（カレンダー読み書き）
4. **API とサービス → 認証情報 → OAuth 2.0 クライアント ID**
   - アプリケーションの種類: **ウェブアプリケーション**
   - 承認済みのリダイレクト URI:
     - 本番: `https://tisly.jp/auth/google/callback`
     - ローカル検証: `http://localhost:3080/auth/google/callback`
5. 発行された **クライアント ID** と **クライアント シークレット** を VPS の `.env` に設定

## サーバー `.env`

```bash
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
GOOGLE_REDIRECT_URI=https://tisly.jp/auth/google/callback
```

`GOOGLE_CALENDAR_ENABLED=false` のときは **モック予定**（デモ用テンプレート）が表示されます。

## 連携機能一覧

| 機能 | 説明 |
|------|------|
| Googleログイン | OAuth 2.0（offline refresh token） |
| カレンダー一覧 | 書き込み可能なカレンダーを選択 |
| 双方向同期 | Google → TiSLY 予定取込 + TiSLY → Google 書き込み |
| 案件自動生成 | 工事・緊急カテゴリの Google 予定から現調案件を自動作成 |
| 移動時間 | Google Maps Directions API（`GOOGLE_MAPS_API_KEY`） |
| 出発時間 | 最初の工事のみ — 開始 − 移動 − 10分 |
| 出発30分前通知 | ブラウザ通知 + 持ち物 PWA へ誘導 |
| 雨予報 | Open-Meteo（日程日詳細） |
| 作業完了反映 | Google 予定タイトルに ✅、説明に完了時刻 |

## API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/google-calendar/status` | 連携ステータス + 設定 |
| GET | `/api/google-calendar/auth/start` | OAuth 開始（JSON `{ url }`） |
| GET | `/auth/google/callback` | Google からのコールバック（本番 URI） |
| GET | `/api/google-calendar/calendars` | カレンダー一覧 |
| PATCH | `/api/google-calendar/settings` | 同期カレンダー・方向の保存 |
| POST | `/api/google-calendar/sync/full` | 双方向フル同期 |
| POST | `/api/schedule/v1/sync/google` | 予定取込のみ（従来） |
| POST | `/api/google-calendar/disconnect` | 連携解除 |

## 使い方（iPhone PWA）

1. App Hub から **日程調整** を開く
2. **⚙️連携** → `/google-calendar-settings-v1`
3. **Googleログイン** → 同意画面で許可
4. 同期カレンダーを選択 → **設定を保存**
5. **双方向同期** を実行
6. 日程画面で予定・出発準備・雨予報を確認

## Googleカレンダー同期テスト手順

### 事前準備

1. VPS `.env` に `GOOGLE_CALENDAR_ENABLED=true` と OAuth 3 項目を設定
2. Google Cloud のリダイレクト URI に `https://tisly.jp/auth/google/callback` を登録
3. `curl -s https://tisly.jp/api/health` でサーバー稼働を確認

### モックモード（OAuth 未設定）

```bash
cd server
GOOGLE_CALENDAR_ENABLED=false npm test -- test/google-calendar-sync-v1.test.ts
```

### 本番接続テスト

1. `TOMS001` / `toms001.surveyor` でログイン
2. `/google-calendar-settings-v1` を開く
3. **Googleログイン** → リダイレクト後「Googleログインが完了しました」トースト
4. **同期カレンダー** に自分のカレンダーが表示されることを確認
5. Google カレンダーに「防犯カメラ設置」等の工事予定を1件作成（当日 or 翌日）
6. **双方向同期** → 「取得 N 件」が 0 より大きいこと
7. `/schedule-v1` で該当日に予定が表示されること
8. 工事予定がなければ `/projects-v1` で Google から自動生成された案件を確認
9. `/schedule-day-v1?date=YYYY-MM-DD` で
   - 移動時間ブロック
   - 雨予報（Open-Meteo）
   - 最初の現場のみ「🚐 出発準備」
10. 出発30分前通知: `/api/schedule/v1/departures/:id/test-notify` または実時間待ち
11. 現場で作業完了 → Google カレンダーで該当予定に ✅ が付くこと

### 回帰チェック

- 写真分離: 仕様書 PDF = 現調写真 / 完了報告 = completion_photos
- `npm test -- test/departure-reminder-v1.test.ts test/schedule-v1.test.ts`

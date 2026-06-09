# Google Calendar 本接続（日程調整 PWA）

日程調整（`/schedule-v1`）から Google カレンダーの予定を読み込む手順です。

## Google Cloud Console 設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成または選択
2. **API とサービス → ライブラリ** で **Google Calendar API** を有効化
3. **API とサービス → OAuth 同意画面**
   - ユーザータイプ: 外部（テスト時はテストユーザーに自分の Gmail を追加）
   - スコープ: `.../auth/calendar.readonly`（カレンダー読み取り）
4. **API とサービス → 認証情報 → OAuth 2.0 クライアント ID**
   - アプリケーションの種類: **ウェブアプリケーション**
   - 承認済みのリダイレクト URI:
     - 本番: `https://tisly.jp/api/google-calendar/oauth/callback`
     - ローカル検証: `http://localhost:3080/api/google-calendar/oauth/callback`
5. 発行された **クライアント ID** と **クライアント シークレット** を VPS の `.env` に設定

## サーバー `.env`

```bash
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
GOOGLE_REDIRECT_URI=https://tisly.jp/api/google-calendar/oauth/callback
```

`GOOGLE_CALENDAR_ENABLED=false` のときは **モック予定**（デモ用テンプレート）が表示されます。クライアント ID 未設定でもアプリは落ちず、「Google連携は未設定です」と表示されます。

## API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/google-calendar/auth/start` | OAuth 開始（JSON `{ url }` を返す） |
| GET | `/api/google-calendar/oauth/callback` | Google からのコールバック |
| POST | `/api/schedule/v1/sync/google` | カレンダー予定を同期・ローカルキャッシュ |

従来の `/api/schedule/v1/sync` も引き続き利用可能です。

## 使い方（iPhone PWA）

1. App Hub から **日程調整** を開く
2. 右上 **Google同期** をタップ
3. 初回（本番モード）: Google ログイン → 日程調整に戻る
4. 再度 **Google同期** で予定を取得
5. 予定名・開始/終了・場所・説明からカテゴリ（工事/事務/家族/重要）を自動判定

## トラブルシュート

- **Google連携は未設定です** — `GOOGLE_CLIENT_ID` / `SECRET` が空、または `GOOGLE_CALENDAR_ENABLED` が `true` なのに資格情報不足
- **redirect_uri_mismatch** — Console のリダイレクト URI と `GOOGLE_REDIRECT_URI` が完全一致しているか確認
- **モックのまま** — `GOOGLE_CALENDAR_ENABLED=false` または OAuth 未完了

# 人間が後で設定する項目（HUMAN_ACTIONS）

Cursor 自走では **mock / disabled / ナビのみ** で進めます。本番連携には以下の手動設定が必要です。

---

## Google Calendar（日程調整 PWA）

日程調整画面（`/schedule-v1`）上部の **Googleカレンダー連携ステータス** で進捗を確認できます。

| 画面表示 | 意味 | 次にやること |
|----------|------|--------------|
| 未設定 | `.env` に OAuth 情報がない | 下記「Google Cloud Console 手順」を実施 |
| 設定済み・未ログイン | サーバー設定は完了、Google 未ログイン | 日程調整で「**Googleログイン**」 |
| Googleログイン済み | OAuth 完了、まだ同期していない | 「**Google予定を同期**」 |
| 同期成功 | 直近の同期が成功 | そのまま利用可（再同期はボタンから） |
| 同期失敗 | 直近の同期がエラー | 画面の日本語エラーを確認して再試行 |

`GOOGLE_CALENDAR_ENABLED=false` のときは **モック予定**（UI: `仮連携中`）。アプリは落ちません。

---

### Google Cloud Console 手順（画像なし・この順で実施）

#### 0. 前提

- Google アカウントで [Google Cloud Console](https://console.cloud.google.com/) にログイン
- プロジェクトを **新規作成** するか、既存の TiSLY 用プロジェクトを選択
- 画面上部のプロジェクト名が意図したプロジェクトになっていることを確認

#### 1. Google Calendar API を有効化

1. 左メニュー **「API とサービス」→「ライブラリ」**
2. 検索欄に `Google Calendar API` と入力
3. **Google Calendar API** を選択 → **「有効にする」**

#### 2. OAuth 同意画面（OAuth consent screen）

1. **「API とサービス」→「OAuth 同意画面」**
2. **User Type（ユーザータイプ）**
   - 社内・自分だけ: **内部**（Google Workspace のみ）
   - 一般 Gmail: **外部**（テスト公開前は「テスト」状態のまま運用可）
3. **アプリ情報**
   - アプリ名: 例 `TiSLY 日程調整`
   - ユーザーサポートメール: 自分のメール
   - デベロッパーの連絡先情報: 自分のメール
4. **スコープ**
   - 「スコープを追加または削除」
   - `https://www.googleapis.com/auth/calendar.readonly`（カレンダーの読み取り）を追加  
     ※ 書き込みが必要な場合のみ `calendar`（フル）を検討。日程 PWA の同期は **readonly で十分**
5. **テストユーザー**（外部＋テスト公開の場合）
   - 「+ ADD USERS」で **智紀の Gmail** を追加（未追加だと `access_denied` になる）
6. **保存して続行** で完了

#### 3. OAuth クライアント ID（Web application）

1. **「API とサービス」→「認証情報」**
2. **「+ 認証情報を作成」→「OAuth クライアント ID」**
3. **アプリケーションの種類**: **ウェブアプリケーション**（Web application）
4. **名前**: 例 `TiSLY Schedule Production`
5. **承認済みのリダイレクト URI（Authorized redirect URIs）** に **1 行だけ** 追加:

   ```
   https://tisly.jp/api/google-calendar/oauth/callback
   ```

   - ローカル検証時のみ追加: `http://localhost:3080/api/google-calendar/oauth/callback`
   - **末尾スラッシュなし**・**http と https を混同しない**
6. **作成** をクリック
7. 表示される **クライアント ID** と **クライアント シークレット** を控える（シークレットは再表示不可のため必ず保存）

#### 4. VPS の `server/.env` に設定

VPS（`/opt/tisly/server/.env` 等、デプロイ先の実パス）に以下を追記または更新。**Secret は Git にコミットしない。**

```bash
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
GOOGLE_REDIRECT_URI=https://tisly.jp/api/google-calendar/oauth/callback
```

| 変数 | 説明 |
|------|------|
| `GOOGLE_CALENDAR_ENABLED` | `true` で本番カレンダーモード。`false` はモック予定 |
| `GOOGLE_CLIENT_ID` | 手順 3 で発行したクライアント ID |
| `GOOGLE_CLIENT_SECRET` | 手順 3 で発行したクライアント シークレット |
| `GOOGLE_REDIRECT_URI` | Console に登録した URI と **完全一致** |

互換エイリアス（`GOOGLE_*` 未設定時のみ）: `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` / `GOOGLE_CALENDAR_REDIRECT_URI`

#### 5. デプロイと画面確認

1. `.env` 保存後、VPS の Node プロセスを再起動（通常は `git push` → GitHub Actions 自動デプロイで反映）
2. https://tisly.jp/schedule-v1 を開く（`TOMS001` / `toms001.surveyor` でログイン）
3. ステータスが **設定済み・未ログイン** になっていることを確認
4. **「Googleログイン」** → Google 同意 → 日程調整に戻る
5. ステータスが **Googleログイン済み** → **「Google予定を同期」** → **同期成功**
6. 週間表示に自分の Google 予定が出ることを確認

#### 6. API で設定確認（任意）

ログイン後、ブラウザの開発者ツールまたは curl:

```bash
GET /api/google-calendar/status
Authorization: Bearer <customer JWT>
```

返るのは `configured` / `connected` / `displayLabel` / `sync.lastSyncedAt` のみ。**`clientSecret` や refresh token は返しません。**

---

**トラブル時のチェックリスト**

- リダイレクト URI が Console と `.env` で **1 文字も違わないか**
- 外部アプリで **テストユーザーに Gmail を追加したか**
- `GOOGLE_CALENDAR_ENABLED=true` か
- VPS 再起動後 https://tisly.jp/api/health の `commitShort` が最新か

---

## Google Maps（移動時間・ナビ）

| 項目 | 環境変数 | 手順 |
|------|----------|------|
| Directions API キー | `GOOGLE_MAPS_API_KEY` | Cloud Console で Directions API を有効化しキー発行 |
| 移動起点（任意） | `DISPATCH_DEFAULT_ORIGIN` | 未設定時は `事務所（守谷市）` |

**未設定時の動作:** ナビ URL 起動のみ、移動時間は目安（mock）、UI: `未設定` + 「Google Maps API未設定：ナビ起動のみ」

**設定後の確認:** 日程詳細の移動時間に `（API）` 表示、UI バッジが `本番連携済み`

---

## VPS 反映確認（毎回 push 後）

1. GitHub Actions **VPS Auto Deploy** が成功していること
2. https://tisly.jp/api/health を開く
3. `commitShort` が push した commit の先頭 7 文字と一致すること

---

## 関連ドキュメント

- [MANUAL_SETUP_REQUIRED.md](./MANUAL_SETUP_REQUIRED.md)
- [VPS_AUTO_DEPLOY.md](./VPS_AUTO_DEPLOY.md)
- [PROJECT_STATUS.md](./PROJECT_STATUS.md)

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

#### 2. OAuth 同意画面 — User Type を **External** にする（`403 org_internal` 対策）

**症状:** Google ログイン画面で `403 org_internal` / 「組織内のユーザーのみ」  
**原因:** OAuth アプリの User Type が **Internal（内部）** のまま。一般 Gmail（`@gmail.com`）はログイン不可。

##### 2-A. 既存プロジェクトで Internal → External に変更（推奨・まず試す）

1. [Google Cloud Console](https://console.cloud.google.com/) を開く
2. プロジェクト **519543353694**（TiSLY Practical PWA）を選択
3. 左メニュー **「Google Auth Platform」**（旧 UI では **「API とサービス」→「OAuth 同意画面」**）
4. **「Audience（対象ユーザー）」** を開く
5. **User Type** が **Internal** なら **「Make External（外部に変更）」** をクリック
   - Internal のままでは **変更できない場合** あり（Workspace 組織ポリシー等）→ 下記 **2-C 新規プロジェクト** へ
6. **Publishing status（公開ステータス）** が **Testing（テスト）** の場合:
   - **「Test users（テストユーザー）」** に **`toms.yamanaka@gmail.com`** を追加（未追加だと `access_denied`）
7. **「Data Access（データアクセス）」**（旧: スコープ）で以下を追加:
   - `https://www.googleapis.com/auth/calendar`（カレンダー読み書き — 日程 PWA の双方向同期に必須）
8. **アプリ情報**
   - アプリ名: `TiSLY Practical PWA`
   - ユーザーサポートメール / デベロッパー連絡先: 自分のメール
9. **保存**

##### 2-B. External + Testing の運用メモ

| 状態 | ログインできるアカウント |
|------|--------------------------|
| Internal | 同じ Google Workspace 組織内のみ |
| External + Testing | **Test users に登録した Gmail のみ** |
| External + In production | 一般公開（審査が必要な場合あり） |

TiSLY 本番運用では **External + Testing + Test users に利用 Gmail を追加** で十分。

##### 2-C. Internal → External に変更できない場合（新規 GCP プロジェクト）

1. Console 右上 **「プロジェクトを選択」→「新しいプロジェクト」**（例: `TiSLY Calendar OAuth`）
2. **Google Calendar API** を有効化（手順 1 と同様）
3. **Google Auth Platform → Branding** でアプリ名等を設定
4. **Audience → User Type: External**、**Testing** のまま
5. **Test users** に `toms.yamanaka@gmail.com` を追加
6. **Data Access** に `https://www.googleapis.com/auth/calendar` を追加
7. **Clients → Create client → Web application**
   - 名前: `TiSLY Production`
   - **Authorized redirect URIs:**

     ```
     https://tisly.jp/auth/google/callback
     ```

8. 発行された **CLIENT_ID / CLIENT_SECRET** を VPS の `server/.env` に反映（手順 4）
9. TiSLY **Googleカレンダー連携** 画面で **連携解除 → 再ログイン**

#### 3. OAuth クライアント ID（Web application）

1. **「Google Auth Platform」→「Clients」**（旧: **「API とサービス」→「認証情報」**）
2. 既存クライアント `519543353694-...` を開く、または **「+ 認証情報を作成」→「OAuth クライアント ID」**
3. **アプリケーションの種類**: **ウェブアプリケーション**
4. **名前**: 例 `TiSLY Practical PWA`
5. **承認済みのリダイレクト URI（Authorized redirect URIs）** に **完全一致** で登録:

   ```
   https://tisly.jp/auth/google/callback
   ```

   - ローカル検証時のみ追加: `http://localhost:3080/auth/google/callback`
   - **末尾スラッシュなし**・**http/https を混同しない**
   - ⚠️ 旧ドキュメントの `/api/google-calendar/oauth/callback` は **使用しない**（レガシー互換ルートのみ残存）
6. **保存**
7. **クライアント ID** と **クライアント シークレット** を控える

#### 4. VPS の `server/.env` に設定

VPS（`/opt/tisly/server/.env`）に以下を追記または更新。**Secret は Git にコミットしない。**  
GitHub Actions Secrets には **GOOGLE_CLIENT_* は未登録**（VPS `.env` のみ。デプロイ workflow が同期するのは `GOOGLE_MAPS_API_KEY` のみ）。

```bash
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CLIENT_ID=519543353694-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
GOOGLE_REDIRECT_URI=https://tisly.jp/auth/google/callback
# 省略可（未設定時は calendar フルスコープ）
GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar
```

| 変数 | 説明 |
|------|------|
| `GOOGLE_CALENDAR_ENABLED` | `true` で本番カレンダーモード。`false` はモック予定 |
| `GOOGLE_CLIENT_ID` | Console の OAuth クライアント ID |
| `GOOGLE_CLIENT_SECRET` | Console のクライアント シークレット |
| `GOOGLE_REDIRECT_URI` | **`https://tisly.jp/auth/google/callback` と Console で完全一致** |
| `GOOGLE_CALENDAR_SCOPES` | 省略可。既定: `https://www.googleapis.com/auth/calendar` |

互換エイリアス（`GOOGLE_*` 未設定時のみ）: `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` / `GOOGLE_CALENDAR_REDIRECT_URI`

#### 5. デプロイと画面確認

1. `.env` 保存後、VPS の Node を再起動（`git push origin master` → GitHub Actions 自動デプロイでも `.env` は保持される）
2. https://tisly.jp/google-calendar-settings-v1 を開く（`TOMS001` / `toms001.surveyor` でログイン）
3. **開発情報** に `redirect_uri` / `client_id`（マスク）/ `hasRefreshToken` を確認
4. **「Googleログイン」** → 同意 → 戻ったら **OAuthデバッグ** パネルで `callback: reached` を確認
5. `org_internal` の場合は Console の **Audience → External + Test users** を再確認
6. **「今すぐ同期」** → **同期成功**
7. 管理者（`toms001.admin`）は **OAuth書き込みテスト** または `POST /api/debug/google-calendar/create-test-event` で Calendar API 書き込みを検証

#### 6. API で設定確認（任意）

```bash
# 認証不要 — OAuth 設定のマスク情報（secret/token は含まない）
GET https://tisly.jp/api/health
→ integrations.googleCalendarOAuth

# ログイン後
GET /api/google-calendar/status
Authorization: Bearer <customer JWT>
→ oauthDebug.redirectUri / clientIdMasked / hasAccessToken / hasRefreshToken
```

---

**トラブル時のチェックリスト**

| エラー | 対処 |
|--------|------|
| `403 org_internal` | Console **Audience → External** + **Test users** に Gmail 追加 |
| `access_denied` | Test users 未登録、またはユーザーが同意を拒否 |
| `redirect_uri_mismatch` | Console と `.env` の URI が **1 文字も違わないか**（`/auth/google/callback`） |
| トークン保存後も同期失敗 | `/api/debug/google-calendar/create-test-event`（本番は admin のみ） |
| `GOOGLE_CALENDAR_ENABLED=true` か | `/api/health` の `googleCalendarOAuth.calendarEnabled` |
| VPS 最新デプロイ | https://tisly.jp/api/health の `commitShort` |

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

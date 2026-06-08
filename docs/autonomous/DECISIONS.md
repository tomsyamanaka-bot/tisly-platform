# 設計判断ログ

## 2026-06-08 — 実務PWA v1 モバイルワークフロー

### UI/UX

- **一般客向け文言を優先** — 「API」「DB」「workflow」など技術用語は画面に出さない
- **カード型 + 大きいボタン** — 片手操作・高齢のお客様にも見やすいレイアウト
- **色** — 黒背景をやめ、白〜`#f6f8fa`〜淡い青/緑（`tisly-friendly-ui.css`）
- **部材選択** — ドロップダウンではなく2列カードグリッド。8種類固定（防犯カメラ〜その他）

### 部材カテゴリ

- `aircon` を廃止し `antenna`（アンテナ）に変更
- 見積へのマッピング: `antenna` → `other`（PRICING_CATEGORIES に未登録のため）
- 既存DBは `migrateSurveyMaterialAntennaCategory` でテーブル再構築

### ナビゲーション

- `tisly-practical-nav.js` を survey-v1 / estimate-v1 / app に共通適用
- 下部タブ: アプリ一覧 / 現調 / 見積 / 作業報告・顧客・在庫（準備中はトースト）

### App Hub

- surveyor には **実務カードのみ** 上部表示。デプロイ系パネルは manager 以上のみ
- ラベル: 「現調する」「見積を作る」など動詞形で直感的に

### 見積

- 項目名をインライン編集可能（PATCH items で name も送信）
- 税計算はフロントでリアルタイム表示 + サーバーで確定
- TOMS形式はスタブプレビュー（本番接続は別フェーズ）

### 本番反映

- 標準手順: `git pull` → `npm run build` → `systemctl restart tisly-server`
- Cursor 環境から VPS SSH が不通のため、人間によるデプロイ確認が必要

## 2026-06-08 — 実務投入 v2（TOMS 向け）

### PDF 認証

- iframe は `fetch` + `Authorization: Bearer` → Blob URL（401 回避）
- 別タブ用に `?access_token=` を `extractBearer` で受理（PDF のみの用途）

### 顧客と現場

- DB: `customer_address` 列を追加（依頼主住所）
- `address` = 工事場所、`site_name` = 現場名、`customer_name` = 依頼主

### 写真

- カメラ (`capture=environment`) とライブラリ (`multiple`) をボタン分離
- アップロード前に Canvas で JPEG 圧縮（最大幅 1600px）
- 一覧は 36 枚ずつ段階表示 + `loading=lazy`

### 見積

- 項目は無制限追加。並び替えはフロント配列 swap → PATCH
- PDF は `renderEstimateHtml`（TOMS ブロック）を正本に。placeholder は廃止方向
- 備考は `survey_memo` に保存（PATCH items の `notes`）

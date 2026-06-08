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
- アップロード前に Canvas / `createImageBitmap` で JPEG 圧縮（最大幅 1600px、失敗時は raw base64）
- 最大 30 枚、表示は最新 12 枚から「さらに表示」
- 選択直後に Blob プレビュー、失敗時は「写真を追加できませんでした。もう一度選んでください」

### 下部ナビ（実務PWA）

1. 日程調整 `/schedule-v1`
2. 現調 `/survey-v1`
3. 見積 `/estimate-v1`
4. 請求 `/estimate-v1`（請求書作成は見積PWA内）
5. 案件一覧 `/app`

### 日程調整

- 予定データは `googleCalendar.ts` モック。DB は現場不可日のみ (`schedule_unavailable_days`)
- 時間軸は表示しない（件数ベースの空き度）
- カテゴリ色: 工事🟫 事務🟦 家族🟩 重要🟥 現場不可=薄赤

### 見積ヘッダー

- UI・PDF とも「工事場所」のみ（`siteName` は JSON 後方互換）
- 表示: 宛名・件名・発行日・見積番号・担当者・工事場所・住所・電話・メール
- 社内用 JSON 確認は「社内用データを確認」に改名

### 見積

- 項目は無制限追加。並び替えはフロント配列 swap → PATCH
- PDF は `renderEstimateHtml`（TOMS ブロック）を正本に。placeholder は廃止方向
- 備考は `survey_memo` に保存（PATCH items の `notes`）

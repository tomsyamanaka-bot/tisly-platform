# Phase 481–500 ステータス

## 完了

| # | 項目 | 状態 |
|---|------|------|
| 1 | Survey 案件管理 API | ✅ `/api/survey/projects` |
| 2 | Survey 写真管理 | ✅ 9分類 + `uploads/survey/` |
| 3 | 手書き図面 | ✅ `/api/survey/drawing` |
| 4 | 現調チェックリスト | ✅ PUT/GET |
| 5 | AI見積候補 | ✅ placeholder |
| 6 | Maintenance 案件 | ✅ `/api/maintenance/cases` |
| 7 | Recovery 履歴 | ✅ maintenance 向け API |
| 8 | Shelly 管理 | ✅ 一覧・再起動 API |
| 9 | PRO Remote Floor Map | ✅ 外周/1F/2F + ピン + 異常ジャンプ |
| 10 | 現調→PRO 連携 | ✅ `import-pro` |
| 11 | GPS 保存 | ✅ 案件 PATCH |
| 12 | PWA オフライン | ✅ SW v481 + ローカルキュー |
| 13 | Docs | ✅ 本ファイル群 |
| 14 | Tests | ✅ survey / maintenance / floor-map |
| 15 | Build | 要 `npm run build` 実行 |

## Phase 501–520 提案

- AI見積: 実モデル連携（Vision + 図面 OCR）
- Workbox 本番化・Background Sync API
- Floor Map: SVG インライン編集・ピンドラッグ
- Survey: 案件一覧 UI・PDF 現調レポート出力
- Maintenance: Shelly Gen2 RPC 実接続
- SSO / リフレッシュトークン（App Hub）

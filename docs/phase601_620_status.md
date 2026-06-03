# Phase 601–620 完了ステータス

## テーマ
TOMS Business Real Send / QNAP Real E2E / Drawing PWA Foundation

## 実装サマリ

### A. Gmail real send
- `gmailRealSend.ts`: multipart MIME, base64url, mock/dryRun/real
- `POST /api/business/google/gmail/send-real`（confirmed 必須）
- プレビュー（宛先・件名・添付名）をレスポンスに含む

### B. QNAP real E2E
- 案件パス `/TOMS/案件/{year}/{projectNo}_{customer}_{title}/`
- サブフォルダ 01–07（07_仕様書 追加）
- `POST /api/business/qnap/create-project-folders`
- `POST /api/business/qnap/upload-file-real`
- `POST /api/business/qnap/test-connection`（mode + guard）

### C. PDF v3
- `services/estimatePdfTemplate.ts` 等（pdf/ テンプレート再エクスポート）
- settings テンプレ名 `toms_standard_v3`

### D–F. 施工図 PWA
- DB: `business_drawing_plans`, `business_drawing_symbols`, `business_specification_docs`
- 画面: `/business/projects/:id/drawing`, `/business/drawing-symbols`, `/business/projects/:id/specification`
- `estimateFromDrawingService.ts`, `specificationPdfService.ts`

### G. UI 導線
- 案件詳細・ホーム・App Hub ワークフロー

## 次 Phase621–640 候補
- Gmail 本番 E2E（実 OAuth + 実 PDF 添付）
- QNAP 実機アップロード UI
- 施工図キャンバス SVG/タッチ改善
- AI 清書・OCR 連携
- Puppeteer PDF 本番固定
- Business 専用 Service Worker + Push

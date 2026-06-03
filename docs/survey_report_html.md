# Survey Report HTML

PDF 前段の HTML レポート。

## URL

- 公開 HTML: `GET /survey/:projectId/report`
- API（認証）: `GET /api/survey/projects/:projectId/report.html`

## 内容

- 現場名・顧客・住所・GPS
- 航空 / 外観 / 室内写真
- 手書き図面
- チェックリスト
- AI Intake / 見積候補
- PRO Remote 連携状況

実装: `server/src/survey/survey-report.ts`

# 案件管理・書類・ステータス — 整理メモ

**最終更新:** 2026-06-18

---

## 画面と役割の分離（Google 同期とは独立）

| 画面 / API | 役割 | パス |
|-----------|------|------|
| **案件ホーム（現場）** | 日程連動・施工中・書類タブ・パイプライン 9 段 | `/projects-v1` |
| **案件管理（事務）** | KPI・検索・QNAP・書類状態・タイムライン | `/project-mgmt-v1` |
| **案件管理詳細** | 概要 / 書類 / 履歴 / ワークフローカード | `/project-mgmt-detail-v1` |
| **書類閲覧 UX** | モバイルカード UI で PDF 代替表示 | `/document-viewer-v1.html` |
| **案件ステータス API** | 自動判定ステータス（色・ラベル） | `GET /api/project-status/v1/:projectId` |

## 導線（壊さないこと）

- `/project-dashboard-v1` → 案件カード → `/projects-v1?projectId=…`
- `/projects-v1` 書類タブ → `/document-viewer-v1.html?projectId=&kind=`
- `/project-mgmt-v1` → `/project-mgmt-detail-v1?projectId=`
- 見積・請求 → `/estimate-v1?projectId=`

## 関連テスト

- `server/test/project-mgmt-v1.test.ts`
- `server/test/document-viewer-v1.test.ts`
- `server/test/work-completion-v1.test.ts`（パイプライン 9 段）

## commit 方針

Google カレンダー同期とは **別 commit** で管理する（`GOOGLE_CALENDAR_LOCK.md` 参照）。

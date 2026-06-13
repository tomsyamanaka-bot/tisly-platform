# QNAP PDF 自動バックアップ計画（次フェーズ）

**最終更新:** 2026-06-13  
**ステータス:** 設計のみ — **未実装**  
**前提仕様:** [project-pdf-storage-spec.md](./project-pdf-storage-spec.md)（ローカル PDF 保存は完成版として維持）

---

## 目的

案件で **作成済みの PDF**（見積書・請求書・報告書）を QNAP NAS へ **自動バックアップ** し、ローカル障害・端末紛失時にも TOMS 運用フォルダと整合したコピーを保持する。

---

## 対象ファイル

| 種別 | ローカル例 | QNAP 例 |
|------|------------|---------|
| 見積書 | `uploads/business/{projectId}/pdfs/estimate-{番号}.pdf` | `/TOMS/TiSLY/projects/{projectId}/pdfs/estimate-{番号}.pdf` |
| 請求書 | `.../invoice-{番号}.pdf` | `.../invoice-{番号}.pdf` |
| 報告書 | `.../report-{タイトル}.pdf` | `.../report-{タイトル}.pdf` |

---

## バックアップタイミング

| # | トリガー | 説明 |
|---|----------|------|
| ① | **PDF 作成時** | 見積 PWA / 完了報告生成など、初回 PDF 書き込み直後 |
| ② | **PDF 再生成時** | 案件詳細「再生成」ボタン成功後 |
| ③ | **1 日 1 回の再同期** | ローカルに存在するが QNAP 未同期（`pending` / `failed`）の PDF を再送 |

既存の QNAP WebDAV / SMB 基盤（`server/src/business/services/qnapBusinessArchive.ts` 等）を再利用する想定。

---

## QNAP 保存先例

```
/TOMS/TiSLY/projects/{projectId}/pdfs/
├── estimate-EST-2026-0001.pdf
├── invoice-INV-2026-0042.pdf
└── report-完了報告.pdf
```

- 案件フォルダ作成は既存 `qnapProjectFolders` と整合
- ファイル名はローカルと同一（`buildProjectPdfFileName()` 準拠）

---

## 失敗時の挙動

| 項目 | 方針 |
|------|------|
| ローカル PDF | **必ず残す**（バックアップ失敗でも削除・上書きしない） |
| DB 状態 | `qnap_backup_status = failed` |
| エラー記録 | `qnap_last_error` にメッセージ保存 |
| 再送 | 次回トリガー（再生成 / 日次再同期）でリトライ |
| PWA 表示 | **出さない**（内部ログ + 管理者画面のみ） |

---

## 成功時の挙動

| 項目 | 方針 |
|------|------|
| DB 状態 | `qnap_backup_status = synced` |
| タイムスタンプ | `qnap_backuped_at` を保存 |
| パス | `qnap_path` に QNAP 上のフルパスを記録 |

---

## QNAP 未設定時

- PWA（案件詳細・見積 PWA）には **バックアップ状態を表示しない**
- サーバー内部ログのみ（`business_integration_log` 等）
- ローカル PDF 保存・共有・再生成は **現行どおり動作**

---

## 将来 DB 項目案（migration は次フェーズ）

専用テーブル `project_pdf_meta` または各 `pdf_path` テーブルへの拡張を想定:

| カラム | 型（案） | 説明 |
|--------|----------|------|
| `storage_provider` | TEXT | `local` / `qnap`（一次保存は引き続き local） |
| `local_path` | TEXT | ローカル相対パス（現 `pdf_path` と同等） |
| `qnap_path` | TEXT | QNAP 上のパス |
| `qnap_backup_status` | TEXT | `pending` / `synced` / `failed` |
| `qnap_backuped_at` | TEXT | 最終成功日時（ISO 8601） |
| `qnap_last_error` | TEXT | 直近エラーメッセージ |

設計コメント: `server/src/projects/project-pdf-store.ts` / `server/src/db/migrate.ts`

---

## 実装 TODO（次フェーズ）

- [ ] DB migration — `project_pdf_meta` または既存テーブル拡張
- [ ] `project-pdf-store.ts` — PDF 作成・再生成後に QNAP キュー投入
- [ ] QNAP アップロード worker — WebDAV/SMB 経由で `/TOMS/TiSLY/projects/{projectId}/pdfs/` へ PUT
- [ ] 日次 cron — `qnap_backup_status IN ('pending','failed')` の再同期
- [ ] 管理者 UI — 案件詳細（管理者のみ）にバックアップ状態バッジ
- [ ] テスト — mock QNAP + 失敗リトライ + ローカル PDF 保全
- [ ] `docs/autonomous/PROJECT_STATUS.md` 更新 — QNAP PDF 連携を完成仕様へ昇格

---

## 関連ドキュメント

- [project-pdf-storage-spec.md](./project-pdf-storage-spec.md) — ローカル PDF 固定仕様
- [qnap_webdav_real_upload.md](./qnap_webdav_real_upload.md) — 既存 WebDAV 実装
- [qnap_diff_sync.md](./qnap_diff_sync.md) — 差分同期（参考）

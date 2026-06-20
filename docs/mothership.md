# TiSLY MotherShip — QNAP TS-464 統合仕様

**最終更新:** 2026-06-21  
**役割:** 本番サーバーではない。TiSLY の **AI知識庫・案件保管庫・バックアップ母艦**。

---

## 確定インフラ

| 項目 | 値 |
|------|-----|
| NAS 名 | TiSLYNAS |
| 固定 IP | 192.168.1.10 |
| 共有フォルダ | TiSLY |
| Windows UNC | `\\192.168.1.10\TiSLY` |
| WebDAV（アプリ連携） | `/storage-settings-v1` で設定 |

---

## トップフォルダと用途

| フォルダ | 用途 | 保存例 |
|----------|------|--------|
| **Projects** | 案件ソース・アーカイブ | `{projectNo}_{現場名}/source/` |
| **Photos** | 現場写真 | `survey/`（現調）· `completion/`（完了報告） |
| **Reports** | 完了報告・現場報告 PDF | `completion-report/` |
| **Documents** | 取説・仕様書・見積/請求 PDF | `specifications/` · `estimates/` · `manuals/` |
| **PLC** | GX Works3 テンプレート | 機種別 `.gxw` / ラダー |
| **ESP** | PlatformIO テンプレート | ボード別 `platformio.ini` + `src/` |
| **Scan** | LiDAR スキャンデータ | `.ply` / `.las` |
| **3DPrint** | 3Dプリント資産 | `CAD/` · `STL/` · `STEP/` · `GCode/` · `Photos/` · `Prototypes/` · `Parts/` · `Manuals/` |
| **SiteMaps** | 俯瞰図・フロアマップ | PNG / PDF |
| **AI** | AI 学習データ・統計エクスポート · **TiSLY Knowledge** | マスタ CSV · KnowledgeCards · SearchIndex |
| **Backups** | 自動バックアップ | `repo-mirror/`（Git リポジトリミラー） |
| **Customers** | 顧客マスター export | CSV / JSON |
| **Estimates** | 見積テンプレート共有 | 標準工事テンプレ |

---

## 案件 ID ルール

```
{市コード}-{YY}-{MMDD}[-{連番}]
```

| 例 | 意味 |
|----|------|
| `MO-26-0620` | 守谷市 · 2026-06-20 採番（連番省略可） |
| `MO-26-0620-001` | 同上 · 当日 1 件目（**アプリ標準**） |
| `JY-26-0701-002` | 常総市 · 2026-07-01 · 2 件目 |

市コード: `MO` 守谷 · `JY` 常総 · `TM` つくばみらい · `TS` つくば（`server/src/projects/project-id-v1.ts`）

### MotherShip 上の案件フォルダ

```
{カテゴリ}/{projectNo}_{現場名}/{サブフォルダ}/{ファイル}
```

例:

```
Photos/MO-26-0620-001_守谷市テスト/survey/2026-06-20_外観_001.jpg
Documents/MO-26-0620-001_守谷市テスト/estimates/MO-26-0620-001_見積書.pdf
Reports/MO-26-0620-001_守谷市テスト/completion-report/完了報告書.pdf
Projects/MO-26-0620-001_守谷市テスト/source/
```

実装: `server/src/storage/mothership-paths-v1.ts`

---

## 既存 WebDAV PDF バックアップとの関係

| 系統 | パス | 用途 |
|------|------|------|
| **WebDAV PDF v1**（完成済み） | `/TiSLY/projects/{projectNo}_{現場}/estimate/` 等 | PWA からの PDF 自動バックアップ |
| **MotherShip SMB**（本仕様） | `/TiSLY/Projects/` · `Photos/` · `Documents/` 等 | ローカル開発 PC からの robocopy · 将来の統合保管 |

両系統は **並行運用**。WebDAV 側を壊さず、MotherShip フォルダへ段階的に整理する。

### TiSLY Knowledge（AI 配下）

```
AI/
├─ Standards/ · Procedures/ · Troubles/ · Templates/
├─ Ladder/ · Materials/ · Tools/ · Notes/
├─ KnowledgeCards/   … knowledge-card.json
└─ SearchIndex/      … キーワードインデックス
```

詳細: [knowledge.md](./knowledge.md) · [knowledge-roadmap.md](./knowledge-roadmap.md) · [qnap-ai-plan.md](./qnap-ai-plan.md)

---

## スクリプト

### QNAP Backup Engine

```powershell
.\scripts\backup-qnap.ps1
```

- robocopy `/MIR` でリポジトリを `\\192.168.1.10\TiSLY\Backups\repo-mirror` へ同期
- 除外: `.git` · `node_modules` · `.next` · `dist` · `build` · `coverage` · `.turbo` · `.vercel`
- ログ: `server/data/mothership-backup/`

### QNAP 接続診断

```powershell
.\scripts\qnap-diagnose.ps1
```

- 接続 · 書込 · 読込 · 速度 · 空き容量 · 標準フォルダ存在
- レポート: `server/data/mothership-diagnose/`

### 統合デプロイ

```powershell
.\scripts\deploy-all.ps1 -CommitMessage "Add TiSLY MotherShip integration"
```

実行順: README 確認 → lint → test → build → commit → push → QNAP Backup → health → レポート

レポート: `server/data/mothership-deploy/`

---

## 写真の分離（必須）

| 種類 | MotherShip | PWA DB |
|------|------------|--------|
| 現調写真 | `Photos/.../survey/` | `survey_photos` |
| 完了報告写真 | `Photos/.../completion/` | `completion_photos` |

**混在禁止** — [PROJECT_STATUS.md](./autonomous/PROJECT_STATUS.md) 参照。

---

## 残課題

- [ ] WebDAV PDF パスを MotherShip `Documents/` へ段階移行
- [ ] PLC / ESP テンプレの QNAP 自動同期ワーカー
- [ ] 日次 integrity: ローカル PDF vs MotherShip 突合
- [ ] VPS → QNAP 直接バックアップ（現状は開発 PC robocopy）

---

## 関連

- [PROJECT_STATUS.md](./autonomous/PROJECT_STATUS.md)
- [project-pdf-storage-spec.md](./project-pdf-storage-spec.md)
- [qnap-pdf-backup-plan.md](./qnap-pdf-backup-plan.md)
- `server/src/storage/qnap-path-builder-v1.ts` — WebDAV PDF パス v1

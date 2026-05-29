# TiSLY PLC Builder v4 — CHANGELOG

## v4.7 — Git保存・履歴管理対応

- `PROJECT_META.json` に `builder_version` / `build_command` / `test_command` / `last_test_status` を追加
- `AUTO_TEST_REPORT.md` に `builder_version` / `test_datetime` / `tested_project` / `test_result` / `next_action` を追加
- 開発後の Git 保存手順を README に追記

## v4.6 — 自動テスト追加

- `test_builder.py` による自動テスト
- `AUTO_TEST_REPORT.md` 出力
- `build.py --sample` 連携検証

## v4.5 — 案件フォルダ自動生成

- `--project-name` による案件フォルダ自動生成
- `generated_projects/` への成果物出力

## v4.0 — 文章仕様から成果物生成

- 文章仕様 → GX 命令 / I/O 表 / 配線図 / README / 監査レポート
- v3 エンジン連携

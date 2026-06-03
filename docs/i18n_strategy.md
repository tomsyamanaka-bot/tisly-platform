# Installer PWA 多言語戦略（placeholder）

## 現状（Phase 361–380）

- UI 文言: **日本語固定**
- 英語辞書: `server/public/js/i18n/installer-en.json`
- ローダー: `server/public/js/installer-i18n.js`（`t(key, fallbackJa)`）

## 対応言語

| コード | 状態 |
|--------|------|
| `ja` | 本番 UI |
| `en` | 辞書のみ（切替 UI は Phase 381+） |

## 将来

- `localStorage` / プロファイルで `locale` 選択
- 施工チェックリスト・完了レポートの locale パラメータ
- 右から左（RTL）は対象外

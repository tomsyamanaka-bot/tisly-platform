# Installer PWA 多言語戦略

## 現状（Phase 381–400）

- 対応: **ja** / **en**
- 保存: `localStorage` `tisly_installer_locale`
- ローダー: `server/public/js/installer-i18n.js`
- 辞書: `server/public/js/i18n/installer-en.json`
- UI: ヘッダ `<select id="locale-select">` + `data-i18n` 属性

## 使い方

```javascript
import { t, setInstallerLocale, applyInstallerI18n } from "./installer-i18n.js";
setInstallerLocale("en");
applyInstallerI18n();
```

## 将来

- 完了レポート HTML の locale クエリ
- チェックリスト項目の翻訳テーブル
- RTL は対象外

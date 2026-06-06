# 本番公開 URL チェック表 — tisly.jp

**Phase 1761–1800** · VPS 投入後、各 URL をブラウザ・端末で確認するためのチェックリストです。

> **事前確認:** `/deployment/checklist` の **VPS Production Rehearsal ステータス** で GitHub / Build / Test / Release Gate / Security が READY であることを確認してから VPS 投入してください。

> チェック欄は手動で `[x]` に書き換えてください。  
> curl 一括確認は [`production_check_commands.md`](./production_check_commands.md) を参照。

**確認日:** _______________  
**確認者:** 智紀さん  
**ビルド / コミット:** _______________

---

## チェック項目の意味

| 項目 | 合格の目安 |
|------|------------|
| 表示 OK | 白画面・無限ロードなし。主要 UI が読める |
| PWA installReady | manifest · Service Worker · HTTPS が有効（「ホーム画面に追加」可能） |
| API 接続 OK | 画面内のデータ取得・ログイン等が動く（コンソールに連続 401/500 なし） |
| 404 なし | 主要アセット・API が 404 にならない |
| 500 なし | ページ読み込み・主要 API が 500 を返さない |
| iPhone 確認 | Safari で表示・PWA 追加を確認 |
| Android 確認 | Chrome で表示・PWA 追加を確認 |
| Google TV 確認 | TV ブラウザまたは `/tv/` ルートで表示確認 |

---

## 1. App Hub

**URL:** https://tisly.jp/app

| チェック項目 | PC | iPhone | Android | Google TV |
|-------------|:--:|:------:|:-------:|:---------:|
| 表示 OK | ☐ | ☐ | ☐ | ☐ |
| PWA installReady | ☐ | ☐ | ☐ | — |
| API 接続 OK | ☐ | ☐ | ☐ | ☐ |
| 404 なし | ☐ | ☐ | ☐ | ☐ |
| 500 なし | ☐ | ☐ | ☐ | ☐ |

メモ: _______________________________________________

---

## 2. 現調（Survey）

**URL:** https://tisly.jp/survey

| チェック項目 | PC | iPhone | Android | Google TV |
|-------------|:--:|:------:|:-------:|:---------:|
| 表示 OK | ☐ | ☐ | ☐ | — |
| PWA installReady | ☐ | ☐ | ☐ | — |
| API 接続 OK | ☐ | ☐ | ☐ | — |
| 404 なし | ☐ | ☐ | ☐ | — |
| 500 なし | ☐ | ☐ | ☐ | — |

メモ: _______________________________________________

---

## 3. ビジネス（Business）

**URL:** https://tisly.jp/business

| チェック項目 | PC | iPhone | Android | Google TV |
|-------------|:--:|:------:|:-------:|:---------:|
| 表示 OK | ☐ | ☐ | ☐ | — |
| PWA installReady | ☐ | ☐ | ☐ | — |
| API 接続 OK | ☐ | ☐ | ☐ | — |
| 404 なし | ☐ | ☐ | ☐ | — |
| 500 なし | ☐ | ☐ | ☐ | — |

メモ: _______________________________________________

---

## 4. 営業（Sales）

**URL:** https://tisly.jp/sales

| チェック項目 | PC | iPhone | Android | Google TV |
|-------------|:--:|:------:|:-------:|:---------:|
| 表示 OK | ☐ | ☐ | ☐ | — |
| PWA installReady | ☐ | ☐ | ☐ | — |
| API 接続 OK | ☐ | ☐ | ☐ | — |
| 404 なし | ☐ | ☐ | ☐ | — |
| 500 なし | ☐ | ☐ | ☐ | — |

メモ: _______________________________________________

---

## 5. 顧客ポータル

**URL:** https://tisly.jp/customer/TOMS001

| チェック項目 | PC | iPhone | Android | Google TV |
|-------------|:--:|:------:|:-------:|:---------:|
| 表示 OK | ☐ | ☐ | ☐ | — |
| PWA installReady | ☐ | ☐ | ☐ | — |
| API 接続 OK | ☐ | ☐ | ☐ | — |
| 404 なし | ☐ | ☐ | ☐ | — |
| 500 なし | ☐ | ☐ | ☐ | — |

メモ: _______________________________________________

---

## 6. PRO Remote

**URL:** https://tisly.jp/customer/TOMS001/pro-remote

| チェック項目 | PC | iPhone | Android | Google TV |
|-------------|:--:|:------:|:-------:|:---------:|
| 表示 OK | ☐ | ☐ | ☐ | ☐ |
| PWA installReady | ☐ | ☐ | ☐ | — |
| API 接続 OK | ☐ | ☐ | ☐ | ☐ |
| 404 なし | ☐ | ☐ | ☐ | ☐ |
| 500 なし | ☐ | ☐ | ☐ | ☐ |

メモ: _______________________________________________

---

## 7. 施工員ホーム（Install）

**URL:** https://tisly.jp/customer/TOMS001/install/home

| チェック項目 | PC | iPhone | Android | Google TV |
|-------------|:--:|:------:|:-------:|:---------:|
| 表示 OK | ☐ | ☐ | ☐ | — |
| PWA installReady | ☐ | ☐ | ☐ | — |
| API 接続 OK | ☐ | ☐ | ☐ | — |
| 404 なし | ☐ | ☐ | ☐ | — |
| 500 なし | ☐ | ☐ | ☐ | — |

メモ: _______________________________________________

---

## 8. Google TV 向け

**URL:** https://tisly.jp/tv/TOMS001

| チェック項目 | PC | iPhone | Android | Google TV |
|-------------|:--:|:------:|:-------:|:---------:|
| 表示 OK | ☐ | — | — | ☐ |
| PWA installReady | — | — | — | — |
| API 接続 OK | ☐ | — | — | ☐ |
| 404 なし | ☐ | — | — | ☐ |
| 500 なし | ☐ | — | — | ☐ |

メモ: _______________________________________________

---

## 9. デプロイチェックリスト

**URL:** https://tisly.jp/deployment/checklist

| チェック項目 | PC | iPhone | Android | Google TV |
|-------------|:--:|:------:|:-------:|:---------:|
| 表示 OK | ☐ | ☐ | ☐ | ☐ |
| PWA installReady | ☐ | ☐ | ☐ | — |
| API 接続 OK | ☐ | ☐ | ☐ | ☐ |
| 404 なし | ☐ | ☐ | ☐ | ☐ |
| 500 なし | ☐ | ☐ | ☐ | ☐ |

メモ: _______________________________________________

---

## 一括 curl（ターミナル用）

```bash
BASE=https://tisly.jp
for path in \
  /app \
  /survey \
  /business \
  /sales \
  /customer/TOMS001 \
  /customer/TOMS001/pro-remote \
  /customer/TOMS001/install/home \
  /tv/TOMS001 \
  /deployment/checklist; do
  code=$(curl -sI -o /dev/null -w "%{http_code}" "${BASE}${path}")
  echo "${path} → HTTP ${code}"
done
```

期待: 各 path が **200** または適切な **301/302**（最終的に 200）。

---

## 総合判定

| 判定 | 条件 |
|------|------|
| **READY** | 9 URL すべて「表示 OK」「404 なし」「500 なし」が PC で合格。主要 PWA は iPhone/Android で installReady 確認済み |
| **NOT READY** | 上記のいずれかが未達。`journalctl -u tisly-server` と [`rollback_guide.md`](./rollback_guide.md) を参照 |

**総合判定:** ☐ READY　☐ NOT READY

署名: _______________　日付: _______________

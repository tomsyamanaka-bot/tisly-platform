# TiSLY Lite RC1 — 営業デモ判定

**判定日:** 2026-06-08  
**対象リリース:** TiSLY Lite RC1 Freeze（`rc1-lite-demo`）  
**ファームウェア:** `1.4.0-remote-test-phase6`  
**本番 URL:** https://tisly.jp/remote-test

---

## 判定結果: **合格（営業デモ可）**

Phase 6 完了時点の実機・PWA 検証をもとに、営業デモとして顧客前で提示可能と判定する。

---

## 検証済み項目

| # | 項目 | 結果 | 備考 |
|---|------|------|------|
| 1 | RP2350 online | ✅ | `lastSeen` 更新・online 表示 |
| 2 | ファームウェア版 | ✅ | `1.4.0-remote-test-phase6` |
| 3 | heartbeat | ✅ | 約 60 秒周期 + 命令直後即時 |
| 4 | CH1〜CH8 Push | ✅ | リレー状態変化で Web Push |
| 5 | ARM Push | ✅ | 警戒 ON 通知 |
| 6 | DISARM Push | ✅ | 警戒 OFF 通知 |
| 7 | intrusion Push | ✅ | 侵入シミュレーション / DI1 連動 |
| 8 | eventHistory | ✅ | 警戒・センサー・操作イベント記録 |
| 9 | PWA 表示 | ✅ | DI/CH/履歴/警戒 UI 正常 |

---

## 営業デモで訴求できる価値

| 訴求ポイント | デモでの見せ方 |
|--------------|----------------|
| スマホ即時通知 | iPhone PWA + Web Push（警戒 ON → 侵入検知） |
| 遠隔制御 | CH1〜CH8 を PWA から ON/OFF（約 3 秒応答） |
| 防犯シナリオ | ARM / DISARM + センサー名称付き通知 |
| 配線なしデモ | 侵入シミュレーションで DI1 疑似発生 |
| 実機連携 | RP2350 実機 heartbeat + リレー動作 |

---

## 営業時に正直に説明すべき制限

| 制限 | 説明用文言（例） |
|------|------------------|
| HTTP ポーリング | 「デモ版は MQTT ではなく HTTPS ポーリング。本番導入時は MQTT TLS へ移行予定」 |
| 共有トークン認証 | 「デモ機は単一トークン。本番はデバイス個別認証を Phase 7 で実装予定」 |
| 単一デバイス | 「1 台の RP2350 のみ接続。マルチ拠点は Phase 7 候補」 |
| VPS 再起動 | 「サーバー再起動で CH 状態ベースラインがリセットされる場合あり」 |
| iOS Push | 「PWA をホーム画面に追加しないと iOS で Push が届かない」 |

詳細: [RELEASE_NOTES.md](./RELEASE_NOTES.md) §既知の制限

---

## 不合格となる条件（再判定トリガー）

以下のいずれかが発生した場合は **営業デモ停止** とし、再検証後に再判定する。

- RP2350 が 90 秒以上 offline のままデモを実施しようとする
- Web Push が端末に届かない（VAPID 未設定・iOS 未登録）
- ARM 中の侵入通知が eventHistory に記録されない
- CH 操作が 10 秒以上応答しない

---

## 次アクション

| 優先 | アクション |
|------|------------|
| 1 | [sales-demo-procedure.md](./sales-demo-procedure.md) に沿った 10 分デモのリハーサル |
| 2 | Git Tag `rc1-lite-demo` の作成（[GIT_TAG_rc1-lite-demo.md](./GIT_TAG_rc1-lite-demo.md)） |
| 3 | 新機能開発は凍結し Phase 7 候補の優先度付け（[phase7-candidates.md](./phase7-candidates.md)） |

---

## 署名

| 役割 | 日付 | 備考 |
|------|------|------|
| 実機検証 | 2026-06-08 | Phase 6 完了確認済み |
| 営業デモ判定 | 2026-06-08 | 本ドキュメントで記録 |

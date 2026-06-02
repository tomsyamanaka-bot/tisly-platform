# TiSLY セキュリティ基準（Phase 41–60）

本番 VPS（ConoHa + tisly.jp）運用時の最低限のセキュリティ方針です。

## ネットワーク

- **MQTT を外部公開しない** — `127.0.0.1:1883` のみ。ファイアウォールで 1883/8883 を閉じる
- **HTTPS 必須** — 管理 UI / API / Web Push / WebSocket は TLS 経由（Let's Encrypt）
- **WebSocket** — `wss://tisly.jp/ws` のみ。平文 `ws` は本番禁止

## 秘密情報

- **`.env` をコミットしない** — `.gitignore` 維持。例は `.env.example` のみ
- **VAPID 秘密鍵** — 漏洩時は即ローテーション、全 PWA 再登録
- **Discord Webhook URL** — URL 自体が認証。漏洩 = 即無効化して再発行
- **`INGEST_SECRET`** — Node-RED → server 用。推測困難なランダム文字列

## アプリケーション

- **管理画面は認証必須**（本番 TODO）— Basic 認証 / OAuth / VPN 内限定のいずれかを nginx またはアプリ層で実装
- **TV ペアリング** — 短時間有効なペアリングコード（6桁・5分等）。将来 API 実装
- **ingest** — `X-TiSLY-Ingest-Secret` 不一致は 403、ログに秘密を出さない

## サーバー OS

- **VPS firewall（ufw）** — SSH + 80/443 のみ
- **fail2ban** — SSH ブルートフォース対策を推奨
- **SSH 鍵認証** — パスワードログイン無効
- **root ログイン禁止** — `PermitRootLogin no`
- **定期バックアップ** — SQLite DB、`/opt/tisly/.env`（暗号化ストレージ）、Node-RED フロー

## Web Push

- 公開鍵のみクライアント配布。秘密鍵は server のみ
- subscription endpoint は個人識別子に近い — DB アクセス制御

## 監査

- nginx / systemd ログの定期確認
- 不要な `npm` グローバルパッケージを最小化
- 依存関係の `npm audit` を定期実行

## 既存デモとの分離

ESP / RP2350 / PLC ローカルデモは従来どおり動作可能。  
本番 ingest は **追加経路** であり、既存ファームの MQTT トピック設計を破壊しない。

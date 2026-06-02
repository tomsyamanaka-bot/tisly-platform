# TiSLY RC1 本番前 TODO

Phase 141–160 で **実装済み** と **現場投入前に必要** を分離します。

## 実装済み（RC1）

| 領域 | 内容 |
|------|------|
| Site Provisioning | `server/src/provisioning/` · `POST /api/sites/create` |
| テンプレート 7 種 | kodate, minpaku, factory, warehouse, garage, aquaculture, ready-mix |
| Device Provisioning | secret 発行 · QR · zone 自動割当 |
| PWA ウィザード | `/setup` 4 ステップ |
| TV 管理 | `/api/tv/devices` · operations TV パネル |
| Recovery Console | `/recovery` · `POST /api/recovery/actions` |
| マルチ現場/顧客 | Site / Tenant Selector |
| Health | `GET /api/health` 拡張 |
| レポート | operations CSV/JSON/PDF · sales JSON |
| 監査ログ | `audit_logs` テーブル |
| QNAP 切替設計 | `QNAP_MODE` mock/real |

## 現場投入前に必要（優先度高）

1. **認証・認可** — admin API の保護、device secret 検証を ingest/MQTT に適用
2. **QNAP 実 SMB** — `smb-client.ts` の writeFile 実装（`@marsaud/smb2` 等）
3. **ESP32 / RP2350 ファーム** — 実機バイナリと OTA
4. **Mosquitto 本番** — TLS + ACL（`docs/mqtt_security_acl_tls.md`）
5. **VPS デプロイ** — HTTPS · 環境変数 · DB バックアップ
6. **ペアリング強化** — コードハッシュ・試行制限・管理画面専用 UX
7. **イベント保持の実削除** — retention 日数に基づく purge ジョブ

## 中優先（Phase 161–180 候補）

- LLM 営業レポート自動生成
- 図面連携（施設マップ）
- RTSP / WebRTC カメラ
- PostgreSQL 移行
- マルチユーザー RBAC
- OTA 一括配信
- PLC Recovery 現場統合

## 運用

- [ ] `docs/demo_runbook.md` で営業トレーニング
- [ ] `docs/rc1_checklist.md` をデプロイ前に全項目確認
- [ ] `git` タグ `rc1-candidate`（リリース時）

関連: `docs/production_readiness_checklist.md`（Phase 121–140）

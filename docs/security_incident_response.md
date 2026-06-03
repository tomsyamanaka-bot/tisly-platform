# Security Incident Response — Phase 181-200

## 漏洩シナリオ別対応

### device secret 漏洩

1. **初動**: 該当デバイス `POST /api/security/devices/:id/rotate-secret`
2. **隔離**: 旧 secret での ingest 拒否確認
3. **復旧**: ファームウェア / Node-RED に新 secret 反映
4. **報告**: audit_logs + SIEM 確認

### ingest secret 漏洩

1. `POST /api/security/rotate-ingest-secret`
2. Node-RED 全フロー更新
3. `.env` 永続化（VPS）

### Discord webhook 漏洩

1. Discord で webhook 削除・再発行
2. `.env` の `DISCORD_WEBHOOK_URL` 更新
3. 漏洩期間の通知内容確認

### MQTT password 漏洩

1. Mosquitto passwordfile 更新
2. 全クライアント再接続
3. ACL 見直し

### 管理者 PW 漏洩

1. `ADMIN_PASSWORD_HASH` 再生成
2. `POST /api/auth/sessions/:id/revoke` で全セッション失効
3. JWT_SECRET ローテーション（全員再ログイン）

### VPS 侵害疑い

1. インスタンス隔離（SG 閉鎖）
2. `npm run db:backup` + ログ保全
3. クリーン再デプロイ
4. 全 secret ローテーション

### QNAP 侵害疑い

1. SMB 資格情報ローテーション
2. archive 整合性確認
3. retention / purge ログ確認

## 初動チェックリスト

- [ ] 影響範囲特定（tenant / site / device）
- [ ] audit_logs + `data/siem/*.ndjson` 保全
- [ ] 関係者連絡
- [ ] 一時 mitigations（revoke / rotate / WAF block）

## 隔離

- デバイス secret revoke
- セッション全 revoke
- MQTT user disable
- nginx IP block

## 復旧

- secret ローテーション完了
- health `/api/health` 全緑
- ingest テストイベント成功
- Operations Security タブでメトリクス正常

## 報告

- 内部: タイムライン + 根本原因
- 顧客: 影響データ範囲（個人情報含む場合は法務確認）

## 関連

- `docs/secret_rotation.md`
- `docs/production_security_checklist.md`

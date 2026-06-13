# QNAP 接続方式比較 — TiSLY PDF バックアップ向け

**最終更新:** 2026-06-13  
**対象:** 案件 PDF の QNAP 自動バックアップ（Phase 1 接続設定の次フェーズ）

---

## 候補方式

| 方式 | 概要 |
|------|------|
| **① SMB** | Windows 標準のファイル共有（CIFS）。`\\NAS\TiSLY` 形式。 |
| **② WebDAV** | HTTP/HTTPS 上のファイル操作（PROPFIND / MKCOL / PUT）。 |
| **③ HybridMount** | QNAP 上で外部ストレージをマウントする機能（NAS 内部向け）。 |

---

## 比較表

| 観点 | ① SMB | ② WebDAV | ③ HybridMount |
|------|-------|----------|---------------|
| **Windows** | ◎ エクスプローラーでそのまま | ○ 「ネットワークドライブの追加」で可能 | △ NAS 管理画面のみ（PC から直接は不可） |
| **VPS (Linux)** | △ `cifs-utils` / ファイアウォール 445 必要 | ◎ HTTPS 1 ポート、Node fetch で完結 | ✕ VPS から QNAP 内部マウントは不可 |
| **Node.js** | △ `@marsaud/smb2` 等が必要・実装未完了 | ◎ **既存 `QnapWebDavClient` 実装済み** | ✕ TiSLY サーバーから利用不可 |
| **QNAP** | ◎ 標準機能・高速 | ◎ QTS WebDAV サーバー標準 | ◎ QNAP→クラウド等のマウント用 |
| **設定難易度** | 中（445/NAS 名解決/VPS 到達性） | **低〜中**（8080/5001 + 共有名） | 高（TiSLY 連携対象外） |
| **速度** | ◎ 大容量・連続転送に強い | ○ PDF 単体 PUT には十分 | — |
| **安定性** | ○ 長時間接続・NAT で切断しやすい | ◎ ステートレス HTTP、リトライ容易 | — |
| **VPS→NAS 到達** | △ 445 が ISP/VPS で塞がれがち | ◎ **443/5001 転送が現実的** | ✕ |

---

## 各環境での実務評価

### Windows（TOMS 事務所 PC）

- **SMB:** 最も自然。エクスプローラーで `\\192.168.1.100\TiSLY` を確認できる。
- **WebDAV:** 「ネットワークドライブ」→ WebDAV で同じフォルダを見られる。手動確認用に十分。
- **HybridMount:** TiSLY アプリからは使わない（QNAP 管理者がクラウド連携する用途）。

### VPS（tisly.jp 本番）

- **SMB:** ConoHa VPS から TOMS 内网 NAS へ 445 到達は **VPN / ポート転送 / Tailscale** が前提。未整備だと失敗しやすい。
- **WebDAV:** **既存実装**（`qnapWebDav.ts`）で PUT/MKCOL/PROPFIND。HTTPS 5001 なら TLS も確保しやすい。
- **HybridMount:** VPS 側から操作する API ではない。

### Node.js

- **WebDAV:** `fetch` のみで動作。追加ネイティブ依存なし。テストも mock しやすい。
- **SMB:** `smb-client.ts` はプレースホルダー（`SMB write pending`）。本番投入には追加ライブラリと接続プール設計が必要。

### QNAP

- WebDAV / SMB とも QTS 標準。PDF 1 ファイルずつのバックアップには WebDAV で十分。
- 大容量一括同期が必要になった場合のみ SMB 併用を検討。

---

## TiSLY 推奨方式

### 標準: **② WebDAV**

**理由:**

1. **VPS + Node.js との相性が最良** — 既存 `QnapWebDavClient` / `qnapBusinessArchive.ts` をそのまま拡張できる。
2. **設定 UI と一致** — IP / ポート / 共有名 / ユーザー / パスワードで WebDAV URL を構成できる（本 Phase 1 実装）。
3. **ファイアウォール** — 8080（LAN）または 5001（HTTPS）の 1 ポートで済む。SMB 445 より VPS 公開が現実的。
4. **安定性** — 1 PDF ごとの PUT + 失敗リトry（`integration-retry-queue`）と相性が良い。
5. **自動バックアップ未実装** — 接続確認・テスト送信まで WebDAV で完成。次フェーズの自動 PUT も同じ経路。

### 補助（任意）: **① SMB**

- TOMS 内 LAN での **手動確認・大量コピー** 用。TiSLY サーバー標準プロトコルにはしない。
- `QNAP_STORAGE_FORCE_REAL` + SMB 実装は NAS 到達性が VPN で確保できてから。

### 採用しない: **③ HybridMount**

- QNAP が Google Drive / S3 等をマウントする機能。**TiSLY → QNAP 方向のバックアップ API ではない**。

---

## Phase 1 実装との対応

| UI 項目 | WebDAV での意味 |
|---------|-----------------|
| IPアドレス | WebDAV ホスト |
| ポート | 8080（HTTP）/ 5001（HTTPS） |
| 共有フォルダ名 | URL パス `/TiSLY` |
| 接続確認 | OPTIONS + PROPFIND |
| テスト PDF | PUT `Test/tisly-test.pdf` |

---

## 関連

- [qnap-pdf-backup-plan.md](./qnap-pdf-backup-plan.md)
- [qnap_webdav_real_upload.md](./qnap_webdav_real_upload.md)
- `server/src/storage/qnap-storage-service.ts`

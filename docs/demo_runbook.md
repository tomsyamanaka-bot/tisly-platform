# TiSLY 営業デモ Runbook（RC1）

Phase 141–160 Production Candidate 向けの **5〜15 分デモ** 手順です。

## 事前準備

```bash
cd server
npm install
npm run build
npm run db:init
npm run dev
# 別ターミナル
npm run demo
```

- URL: `http://localhost:3080`
- デモデータ: `TISLY_DEMO_MODE=true`（`npm run demo` で設定可）

## 5 分デモ（最短）

| 分 | 画面 | 操作 | 話すポイント |
|----|------|------|--------------|
| 0–1 | `/sales` | AI インサイト表示 | 通知→運用→復旧の進化 |
| 1–3 | `/operations` | マップ・Alarm・Health | マルチ現場・SOC/NOC |
| 3–4 | `/setup` | 戸建テンプレで現場作成 | ワンクリックプロビジョニング |
| 4–5 | `/recovery` | Escalate デモ | 自律復旧・手動 Run |

即時イベント:

```bash
curl -X POST http://localhost:3080/api/test/alarm
```

## 15 分デモ（フル）

1. **営業画面** `/sales` — 顧客向け価値・AI ハイライト
2. **セットアップ** `/setup` — Step1 現場 → Step2 QR 機器 → Step3 通知ルール → Step4 TV
3. **運用コンソール** `/operations` — Site / Zone / Device / TV / Recovery タブ
4. **Recovery Console** `/recovery` — 異常・履歴・Restart Device
5. **Analytics** `/analytics` — リスクスコア
6. **レポート** `/api/reports/operations?format=csv` — 運用 CSV 出力

## 実機なしスモーク

```bash
curl http://localhost:3080/api/test/help
curl -X POST http://localhost:3080/api/sites/create -H "Content-Type: application/json" -d "{\"name\":\"デモ現場\",\"templateId\":\"kodate\"}"
curl -X POST http://localhost:3080/api/provisioning/devices -H "Content-Type: application/json" -d "{\"siteId\":\"<site-id>\",\"deviceType\":\"gateway\"}"
```

## トラブル時

| 症状 | 対処 |
|------|------|
| イベントが出ない | `npm run demo` / `POST /api/demo/start` |
| Push 失敗 | VAPID 鍵を `.env` に設定 |
| QNAP mock | `QNAP_MODE=mock`（既定）— 本番は real + SMB 資格情報 |

詳細: `docs/rc1_checklist.md` · `docs/production_todo.md`

# TiSLY 現場運用フロー v1（Phase 1681–1720）

本番公開後、現調 → 見積 → 施工 → 引渡し → 保守 を**スマホで迷わず**回すための運用ガイドです。  
VPS公開設定・既存URL・既存PWA・既存APIは変更しません。

## 全体フロー

```
現調 (/survey)
    ↓ 新規現調開始 · GPS · 分類写真 · 音声/手書き · AI見積候補
見積 (/project/:id → AI見積 v4)
    ↓ LAN / カメラ / ESP / Shelly / 電源 / 工事費
施工 (/customer/:code/install/home)
    ↓ 今日やること · チェックリスト · QR · 機器 · 写真 · 動作確認 · 完了
引渡し (/customer/:code)
    ↓ 引渡し確認カード · handover パッケージ
保守 (/maintenance)
    ↓ 点検予定 · 完了 · 部材 · Shelly · 次回点検
PRO Remote (/customer/:code/pro-remote)
    ↓ 外周 / 1F / 2F 縦スクロール + 現調・施工メディア
```

---

## 現場での使い方

1. **App Hub** (`/app`) からログイン（surveyor / installer / maintenance / manager）
2. 案件がある場合は **案件司令塔** (`/project/:id`) を開き、フローカードで進捗確認
3. 各 PWA はホーム画面に追加して現場で単独利用
4. オフライン時はローカルキューに保存し、オンライン復帰後に「同期」

---

## 現調用の流れ（/survey）

| 手順 | 操作 |
|------|------|
| 1 | **新規現調開始** で案件を作成 |
| 2 | GPS 自動取得 → 住所逆引きで現場住所を入力 |
| 3 | **写真を追加** + 分類（外観/室内/図面/電気/LAN/カメラ/センサー） |
| 4 | 手書き図面（キャンバス or ファイル）・音声メモ |
| 5 | チェックリスト・メモ保存 |
| 6 | **AI見積候補を生成** → 案件司令塔へ |
| 7 | 未同期件数があれば **同期** |

**API**: `POST /api/survey/projects`, `POST /api/survey/reverse-geocode`, `GET /api/field-operations/survey/:id/business-link`

---

## 施工員用の流れ（/customer/TOMS001/install/home）

縦並び 7 ステップ:

| # | カード | 内容 |
|---|--------|------|
| 1 | 今日やること | 当日の作業概要 |
| 2 | 施工チェックリスト | 済/要確認/未 |
| 3 | QR読取 | 機器ラベルスキャン |
| 4 | 機器登録 | オンボード・MQTT |
| 5 | 写真登録 | 設置写真 |
| 6 | 動作確認 | MQTT / Shelly 確認 |
| 7 | 完了報告 | 作業完了・引渡し準備 |

**API**: `POST /api/customer/:code/install/session/start`, `POST /api/customer/:code/install/photo`

---

## 顧客引渡しの流れ（/customer/:code）

1. 顧客ポータルにログイン
2. **引渡し確認** カードで以下を確認:
   - 導入機器 / 設置写真 / 保守内容
   - 通知先 / 緊急時の流れ / QR・PWA案内
3. **引渡しパッケージ** (`/customer/:code/handover`) で詳細 PDF・QR 一覧

**API**: `GET /api/customer/:code/handover`, `GET /api/customer/:code/field-view`

---

## PRO Remote連携の流れ

1. 現調で **PRO Floor Map 生成** または案件司令塔で **PRO Remoteへ反映**
2. `/customer/:code/pro-remote` を開く（外周 → 1F → 2F 縦スクロール）
3. 各フロアカード下部に現調・施工の写真/図面サムネイルを表示
4. 屋上階層は作成しません（外周 / 1F / 2F のみ）

**API**: `POST /api/field-operations/projects/:id/pro-remote-sync`, `POST /api/survey/projects/:id/generate-floor-map`, `GET /api/customer/:code/pro-remote/floor-stack?rc=2`

---

## 案件司令塔（/project/:id）

| カード | 内容 |
|--------|------|
| 現調情報 | GPS・AI v4 分析 |
| 写真 | 現調/施工枚数 |
| 図面 | 図面件数 |
| AI見積候補 | v4 信頼度 |
| 施工予定 | TOMS 状態 |
| 保守予定 | 点検予定 |
| 顧客引渡し | 完了報告 |

**アクションボタン**: 見積作成 · 施工へ進む · 顧客に共有 · PRO Remoteへ反映

**API**: `POST /api/field-operations/projects/:id/estimate-v4`

---

## 保守 PWA（/maintenance）

1画面で表示:

- 点検予定 / 点検完了 / 写真 / 交換部材
- Shelly再起動履歴 / 異常メモ / 次回点検日

**API**: `POST /api/maintenance/report`, `POST /api/field-operations/maintenance/reports/:id/parts`

---

## 資産管理（/assets）

種別: ESP, Shelly, Camera, SwitchBot, Sensor

**API**: `GET /api/field-operations/assets?customerCode=TOMS001`

---

## KPI（/business）

**API**: `GET /api/field-operations/kpi`

---

## Field Ready 監査

```bash
curl http://localhost:3080/api/field-operations/audit
```

| フィールド | 説明 |
|-----------|------|
| surveyReady | 現調 PWA UX |
| projectReady | 案件司令塔カード |
| installReady | 施工縦並びフロー |
| maintenanceReady | 保守 1 画面 |
| customerHandoverReady | 引渡し確認カード |
| proRemoteLinked | フロアメディア連携 |
| fieldReadyRate | 準備率 (%) |
| verdict | FIELD_READY / FIELD_WARNING / FIELD_NOT_READY |

---

## テスト

```bash
cd server
npm run build
npx tsc --noEmit
npm run test
npm run test:phase1681
```

---

## 関連画面 URL 一覧

| 画面 | URL |
|------|-----|
| 現調 | `/survey` |
| 案件司令塔 | `/project/:id` |
| 施工ホーム | `/customer/TOMS001/install/home` |
| 施工ハブ | `/install` |
| 保守 | `/maintenance` |
| 顧客ポータル | `/customer/TOMS001` |
| 引渡し | `/customer/TOMS001/handover` |
| PRO Remote | `/customer/TOMS001/pro-remote` |
| 資産一覧 | `/assets` |
| 業務 KPI | `/business` |
| App Hub | `/app` |

## API 一覧（Phase 1681 追加分）

| メソッド | パス |
|----------|------|
| GET | `/api/field-operations/audit` |
| POST | `/api/field-operations/projects/:id/pro-remote-sync` |
| POST | `/api/field-operations/projects/:id/estimate-v4` |
| GET | `/api/field-operations/survey/:id/business-link` |
| GET | `/api/customer/:code/handover` |
| GET | `/api/customer/:code/pro-remote/floor-stack?rc=2` |

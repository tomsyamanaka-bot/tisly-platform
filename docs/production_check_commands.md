# 本番公開後の確認コマンド集

**Phase 1541–1580** · VPS またはお手持ちの PC から **curl** で tisly.jp の状態を確認します。

ベース URL は本番固定です。ローカル検証時は `BASE=http://localhost:3080` に読み替えてください。

```bash
BASE=https://tisly.jp
```

`jq` があると JSON が見やすくなります（なくても動作します）。

---

## API

### Health

```bash
curl -sS "${BASE}/api/health"
```

期待: `"ok": true`

### Preflight（.env 不足一覧）

```bash
curl -sS "${BASE}/api/deploy/preflight"
```

期待: `"ready": true` · `"missing": []`

`jq` あり:

```bash
curl -sS "${BASE}/api/deploy/preflight" | jq '.ready, .missing'
```

### Release Gate

```bash
curl -sS "${BASE}/api/deploy/release-gate" | head -c 800
```

`jq` あり（要約）:

```bash
curl -sS "${BASE}/api/deploy/release-gate" | jq '{
  passed: .passed,
  releaseGate: .releaseGate.status,
  vpsReady: .vpsDeployStatus.ready,
  publicUrl: .tislyPublicUrl
}'
```

---

## PWA / ページ（HTTP ステータス）

ヘッダのみ確認（200 / 301 / 302 を許容）:

```bash
for path in /app /survey /business /sales /tv/TOMS001; do
  code=$(curl -sI -o /dev/null -w "%{http_code}" "${BASE}${path}")
  echo "${path} → HTTP ${code}"
done
```

### 個別

```bash
curl -sI "${BASE}/app" | head -5
curl -sI "${BASE}/survey" | head -5
curl -sI "${BASE}/business" | head -5
curl -sI "${BASE}/sales" | head -5
curl -sI "${BASE}/tv/TOMS001" | head -5
```

### 顧客・チェックリスト

```bash
curl -sI "${BASE}/customer/TOMS001" | head -3
curl -sI "${BASE}/customer/TOMS001/pro-remote" | head -3
curl -sI "${BASE}/customer/TOMS001/install/home" | head -3
curl -sI "${BASE}/deployment/checklist" | head -3
```

---

## HTTPS リダイレクト確認

```bash
curl -sI "http://tisly.jp/app" | head -5
```

期待: `301` または `308` で `https://` へリダイレクト

---

## WebSocket（nginx 設定の目安）

WSS は curl だけでは完全検証できません。nginx テンプレに `/ws` があるか VPS で:

```bash
grep -n "location /ws" /opt/tisly/server/deploy/nginx/tisly.jp.conf
```

ブラウザ確認: `https://tisly.jp/deployment/checklist` の WebSocket 行

---

## 一括スモーク（コピペ用）

```bash
BASE=https://tisly.jp
set -e
echo "=== API ==="
curl -sf "${BASE}/api/health" | head -c 200 && echo
curl -sf "${BASE}/api/deploy/preflight" | head -c 300 && echo
echo "=== Pages ==="
for p in /app /survey /business /sales /tv/TOMS001 /deployment/checklist; do
  curl -sfI "${BASE}${p}" | head -1
done
echo "=== DONE ==="
```

---

## ブラウザでの最終確認

機械チェックのあと、必ず開いてください:

```
https://tisly.jp/deployment/checklist
```

9 URL · API · PWA · mock/real · iPhone / Android / Google TV の手動項目が一覧されます。

---

## 関連

- 初回投入手順: [`vps_first_launch_for_tomonori.md`](./vps_first_launch_for_tomonori.md)
- ロールバック: [`rollback_guide.md`](./rollback_guide.md)

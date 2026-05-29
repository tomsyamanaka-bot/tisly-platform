# 005 SENSOR_LATCH — センサー検知保持

> TiSLY PLC Template Library v1  
> 部品ID: `TPL-005`  
> 由来: TiSLY_HOME_Security_DEMO 段4・段5

---

## 概要

**警戒中（M0）** かつ **センサー入力（X）** が ON になると、警報リレーを **SET 保持** します。  
センサーが OFF に戻っても警報状態は維持され、明示的な RST まで解除されません。

```
M0 + X ──→ SET（ラッチ保持）
```

---

## 用途

| シーン | 割り当て例 |
|--------|-----------|
| ホームセキュリティ | 外周検知 M1 / 近接検知 M2 |
| 工場 | 安全カーテン / 在席センサー |
| 民泊 | ドアセンサー / PIR センサー |
| 車屋 | シャッター開閉検知 |
| 倉庫 | 温度異常 / 扉開閉検知 |

---

## パラメータ（置換可能）

| 記号 | デフォルト | 説明 |
|------|-----------|------|
| `{M_ARMED}` | M0 | 前提条件（警戒中等） |
| `{X_SENSOR}` | X2, X3 | センサー入力 |
| `{M_LATCH}` | M1, M2 | 警報保持リレー |

---

## ラダー図

### センサー1（外周検知）

```
コメント: {M_ARMED} + {X_SENSOR_1} → {M_LATCH_1} SET
|----[ {M_ARMED} ]----[ {X_SENSOR_1} ]----( SET {M_LATCH_1} )----|
```

### センサー2（近接検知）

```
コメント: {M_ARMED} + {X_SENSOR_2} → {M_LATCH_2} SET
|----[ {M_ARMED} ]----[ {X_SENSOR_2} ]----( SET {M_LATCH_2} )----|
```

---

## 命令語（IL）

```il
; センサー1 警報保持
LD     {M_ARMED}
AND    {X_SENSOR_1}
SET    {M_LATCH_1}

; センサー2 警報保持
LD     {M_ARMED}
AND    {X_SENSOR_2}
SET    {M_LATCH_2}
```

---

## 動作仕様

1. `{M_ARMED}` が ON かつ `{X_SENSOR}` が ON → `{M_LATCH}` を SET
2. センサー OFF 後も `{M_LATCH}` は ON を維持（ラッチ）
3. RST 条件:
   - 001_SELF_HOLD：`{X_START}` OFF → 一括 RST
   - 002_ESTOP：`{X_ESTOP}` ON → 一括 RST

---

## 設計メモ

- SET 命令のみ使用。OUT による自己保持は使わない（状態が明確）
- センサー数は `{X_SENSOR_n}` / `{M_LATCH_n}` を増やして拡張
- `{M_ARMED}` が OFF の間はセンサーが ON でもラッチしない（誤警報防止）
- 各 `{M_LATCH}` は独立保持。M1 と M2 が同時 ON も可能

---

## 組み合わせ例

```
001_SELF_HOLD（M0）
      ↓
002_ESTOP
      ↓
005_SENSOR_LATCH
  ├─ M0 + X2 → M1（外周）
  └─ M0 + X3 → M2（近接）
      ↓
006 / 007（出力制御）
```

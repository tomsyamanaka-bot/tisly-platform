# 001 SELF_HOLD — 警戒ON保持

> TiSLY PLC Template Library v1  
> 部品ID: `TPL-001`  
> 由来: TiSLY_HOME_Security_DEMO 段1・段2

---

## 概要

操作スイッチ（X0）の ON 信号を内部リレー（M0）に **SET 保持** する基本部品です。  
OFF 時は M0 および関連ラッチを一括 RST します。

```
X0 ──→ M0（保持）
X0 OFF ──→ M0 RST
```

---

## 用途

| シーン | 割り当て例 |
|--------|-----------|
| ホームセキュリティ | 警戒 ON / ARM |
| 工場 | ライン稼働許可 |
| 民泊 | チェックイン後 監視モード |
| 車屋 | 夜間警備モード |
| 倉庫 | 在庫監視モード |

---

## パラメータ（置換可能）

| 記号 | デフォルト | 説明 |
|------|-----------|------|
| `{X_START}` | X0 | 開始スイッチ（警戒ON） |
| `{X_ESTOP}` | X1 | 非常停止（ANI 条件） |
| `{M_ARMED}` | M0 | 保持対象内部リレー |
| `{M_LATCH_*}` | M1, M2 | OFF 時に同時 RST するラッチ群 |

---

## ラダー図

### 段A：ON 保持（SET）

```
コメント: {X_START} ON かつ {X_ESTOP} でない → {M_ARMED} SET
|----[ {X_START} ]----[/ {X_ESTOP} ]----( SET {M_ARMED} )----|
```

### 段B：OFF リセット（RST）

```
コメント: {X_START} OFF → {M_ARMED} / ラッチ群 RST
|----[/ {X_START} ]----+----( RST {M_ARMED} )----|
                       +----( RST {M_LATCH_1} )----|
                       +----( RST {M_LATCH_2} )----|
```

---

## 命令語（IL）

```il
; 段A：ON 保持
LD     {X_START}
ANI    {X_ESTOP}
SET    {M_ARMED}

; 段B：OFF リセット
LDI    {X_START}
RST    {M_ARMED}
RST    {M_LATCH_1}
RST    {M_LATCH_2}
```

---

## 動作仕様

1. `{X_START}` が ON かつ `{X_ESTOP}` が OFF → `{M_ARMED}` を SET（保持）
2. `{X_START}` が OFF → `{M_ARMED}` と関連ラッチを RST
3. `{M_ARMED}` は `{X_START}` が OFF になるまで ON を維持

---

## 設計メモ

- SET/RST 命令を使用するため、OUT による自己保持回路より **状態が明確**
- OFF リセット段は **002_ESTOP の前** に配置すること（非常停止が最優先）
- ラッチ数はプロジェクトに応じて `{M_LATCH_n}` を増減

---

## 組み合わせ例

```
001_SELF_HOLD  →  M0（警戒中）
      ↓
005_SENSOR_LATCH  →  M1, M2（警報保持）
      ↓
007_OUTPUT_CONTROL  →  Y0〜Y4
```

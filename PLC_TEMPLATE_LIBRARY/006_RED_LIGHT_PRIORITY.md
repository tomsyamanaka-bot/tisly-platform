# 006 RED_LIGHT_PRIORITY — 高速点滅優先

> TiSLY PLC Template Library v1  
> 部品ID: `TPL-006`  
> 由来: TiSLY_HOME_Security_DEMO 段6

---

## 概要

同一出力（赤ライト Y0）に **低速点滅（003）** と **高速点滅（004）** の両方が成立しうる場合、  
**M2（近接警報）を最優先** し、M0（警戒中）の低速点滅は M2 OFF 時のみ有効にします。

```
M2 + SM412（高速）  ┐
                    ├─ OR ──→ M20
M0 + SM413（低速）  ┘   ※ M2 OFF 時のみ
     M2 優先
```

---

## 優先度

```
002_ESTOP  >  M2 高速点滅  >  M0 低速点滅  >  OFF
```

| 条件 | 出力動作 |
|------|---------|
| M2 ON（近接警報） | SM412 による **高速点滅**（最優先） |
| M0 ON かつ M2 OFF | SM413 による **低速点滅** |
| M0 OFF かつ M2 OFF | OFF |
| X1 非常停止 ON | 002 で直接 RST → OFF |

---

## パラメータ（置換可能）

| 記号 | デフォルト | 説明 |
|------|-----------|------|
| `{M_ALARM_HIGH}` | M2 | 高速点滅条件（最優先） |
| `{M_ARMED}` | M0 | 低速点滅条件 |
| `{CLK_FAST}` | SM412 | 0.1秒クロック（FX3U: M8012） |
| `{CLK_SLOW}` | SM413 | 1秒クロック（FX3U: M8013） |
| `{M_DRIVE}` | M20 | 集約出力内部リレー |

---

## ラダー図

```
コメント: M2 時 0.1s 高速点滅優先 / M0 時 1s 低速点滅
|----[ {M_ALARM_HIGH} ]----[ {CLK_FAST} ]----+
                                              |
|----[/ {M_ALARM_HIGH} ]----[ {M_ARMED} ]----[ {CLK_SLOW} ]----+
                                                                 |
                                                                 +----( {M_DRIVE} )----|
```

---

## 命令語（IL）

```il
; 高速 / 低速 優先結合 → M20
LD     {M_ALARM_HIGH}
AND    {CLK_FAST}
LD     {M_ARMED}
ANI    {M_ALARM_HIGH}
AND    {CLK_SLOW}
ORB
OUT    {M_DRIVE}
```

---

## 動作仕様

1. `{M_ALARM_HIGH}` ON → `{CLK_FAST}` と AND → 高速点滅パルス生成
2. `{M_ALARM_HIGH}` OFF かつ `{M_ARMED}` ON → `{CLK_SLOW}` と AND → 低速点滅パルス生成
3. 両条件を ORB で結合し `{M_DRIVE}` に集約
4. `{M_DRIVE}` は **007_OUTPUT_CONTROL** で Y0 に接続

---

## 設計メモ

- **ANI {M_ALARM_HIGH}** が排他制御のキー。これがないと M0 低速と M2 高速が同時成立
- Y0 への直接 OUT は **007** のみ。本テンプレートは M20 まで
- 3段階以上の優先度が必要な場合は M リレーを追加し ORB 段を拡張

---

## 組み合わせ例

```
003_BLINK_SLOW ──┐
                 ├──→ 006_RED_LIGHT_PRIORITY ──→ M20
004_BLINK_FAST ──┘
                        ↓
                 007_OUTPUT_CONTROL ──→ Y0
```

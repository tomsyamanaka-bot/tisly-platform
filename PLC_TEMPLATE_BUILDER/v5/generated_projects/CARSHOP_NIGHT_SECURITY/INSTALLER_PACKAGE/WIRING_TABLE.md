# 配線表 — CARSHOP_NIGHT_SECURITY

**TiSLY PLC Builder v5.26 — Installer Package**

# WIRING_DIAGRAM — TiSLY PLC Builder v5.0

> TiSLY株式会社 / 車屋展示場 夜間監視 — ASCII 配線図

---

## 入力回路（24V DC）

```
X0 ---- 警戒SW
X1 ---- E-STOP
X2 ---- 赤外線ビーム
X3 ---- 赤外線ビーム
X4 ---- 赤外線ビーム
X5 ---- 赤外線ビーム
X6 ---- PIRセンサー
X7 ---- PIRセンサー
```

---

## 出力回路

```
Y0 ---- パトライト（赤）24V
Y1 ---- リレー1 ---- 白灯100V
Y2 ---- リレー2 ---- 白灯100V
Y3 ---- リレー3 ---- 白灯100V
Y4 ---- リレー4 ---- 白灯100V
```

---

## 配線メモ

| 項目 | 内容 |
|------|------|
| PLC | FX5UJ-24MR/ES |
| 入力電源 | DC24V（コモン COM） |
| 赤外線 / PIR | センサー出力 a接点 → X 入力 |
| マグネット | ドアセンサー b接点 → X 入力 |
| 非常停止 | b接点 NC。OFF で全出力停止 |
| パトライト | Y0 赤 24V 直結（黄/緑は拡張時） |
| ブザー | 24V ブザー直結 |
| 白灯 | 中継リレー経由 AC100V |

---

**TiSLY PLC Builder v5.0 — WIRING_DIAGRAM**


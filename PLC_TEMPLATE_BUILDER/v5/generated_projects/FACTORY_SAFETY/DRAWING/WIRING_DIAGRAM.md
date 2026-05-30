# WIRING_DIAGRAM — TiSLY PLC Builder v5.0

> TiSLY株式会社 / FACTORY_SAFETY デモ案件 — ASCII 配線図

---

## 入力回路（24V DC）

```
X0 ---- ライン起動
X1 ---- E-STOP
X2 ---- 赤外線ビーム
X3 ---- PIRセンサー
```

---

## 出力回路

```
Y0 ---- パトライト
Y1 ---- 警報ブザー24V
Y2 ---- 搬送停止
Y3 ---- 安全警告灯
Y4 ---- 設備異常表示
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

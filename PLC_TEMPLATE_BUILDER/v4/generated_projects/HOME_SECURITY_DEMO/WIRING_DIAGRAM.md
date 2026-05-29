# WIRING_DIAGRAM — TiSLY PLC Builder v4

> ASCII 配線図（FX5UJ / GX Works3）

---

## 入力回路（24V DC）

```
X0 ---- 警戒SW
X1 ---- E-STOP
X2 ---- 外周ビーム
X3 ---- 近接ビーム
```

---

## 出力回路

```
Y0 ---- 赤灯24V
Y1 ---- リレー1 ---- 白灯100V
Y2 ---- リレー2 ---- 白灯100V
Y3 ---- リレー3 ---- 白灯100V
Y4 ---- リレー4 ---- 白灯100V
```

---

## 配線メモ

| 項目 | 内容 |
|------|------|
| 入力電源 | DC24V（コモン COM） |
| 赤灯 | PLC 出力 Y0 直結 24V ランプ |
| 白灯 | PLC 出力 → 中継リレー → AC100V 照明 |
| 非常停止 | X1 常時 ON（b接点）。OFF で全出力停止 |

---

**TiSLY PLC Builder v4 — WIRING_DIAGRAM**

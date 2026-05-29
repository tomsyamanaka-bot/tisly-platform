(*
  プロジェクト名 : TiSLY_HOME_Security_DEMO
  命令一覧（IL）形式 — GX Works2「命令入力」モードで転記用
*)

(* 段1：警戒ON保持 — X0=ON かつ 非常停止でない → M0 SET *)
LD    X0
ANI   X1
SET   M0

(* 段2：警戒OFFリセット — X0=OFF → M0/M1/M2 RST *)
LDI   X0
RST   M0
RST   M1
RST   M2

(* 段3：非常停止 — X1=ON → 内部リレーRST + 全出力OFF *)
LD    X1
RST   M0
RST   M1
RST   M2
RST   Y0
RST   Y1
RST   Y2
RST   Y3
RST   Y4

(* 段4：センサー1警報保持 — M0 かつ X2 → M1 SET *)
LD    M0
AND   X2
SET   M1

(* 段5：センサー2警報保持 — M0 かつ X3 → M2 SET *)
LD    M0
AND   X3
SET   M2

(* 段6a：Y0制御リレー M20 — M2高速点滅優先、それ以外 M0低速点滅 *)
LD    M2
AND   M8012
LD    M0
ANI   M2
AND   M8013
ORB
OUT   M20

(* 段6b：Y0 赤ライト出力 — M20 経由（二重コイルなし） *)
LD    M20
OUT   Y0

(* 段7：Y1 白ライト1 — M1=ON で常時点灯 *)
LD    M1
OUT   Y1

(* 段8：Y2 白ライト2 — M1=ON かつ 1秒クロックで点滅 *)
LD    M1
AND   M8013
OUT   Y2

(* 段9：Y3 白ライト3 — M2=ON で常時点灯 *)
LD    M2
OUT   Y3

(* 段10：Y4 白ライト4 — M2=ON で常時点灯 *)
LD    M2
OUT   Y4

END

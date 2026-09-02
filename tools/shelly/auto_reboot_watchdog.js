// TiSLY 電源フェイルセーフ — Shelly 1 Mini Gen3
// RP2350 固定IPへ 60秒周期で HTTP 疎通確認
// 連続3回失敗 → Switch OFF → 5秒後 ON（コールドリブート）
//
// 使い方:
//  1. TARGET_URL を RP2350 の疎通URLに変更
//     例: http://192.168.10.50/ または heartbeat 用URL
//  2. Shelly WebUI → Scripts に貼り付けて保存・有効化
//  3. ログに [TiSLY] が出ることを確認
//
// 生成API: GET /api/home/v1/hardware/shelly-watchdog-script

let TARGET_URL = "http://192.168.1.50/";
let FAIL_LIMIT = 3;
let INTERVAL_MS = 60000;
let OFF_MS = 5000;
let failCount = 0;
let cycling = false;

function powerCycle() {
  if (cycling) return;
  cycling = true;
  print("[TiSLY] RP不通 → Shelly電源OFF");
  Shelly.call("Switch.Set", { id: 0, on: false }, function () {
    Timer.set(OFF_MS, false, function () {
      print("[TiSLY] Shelly電源ON（再投入）");
      Shelly.call("Switch.Set", { id: 0, on: true }, function () {
        cycling = false;
        failCount = 0;
      });
    });
  });
}

function checkTarget() {
  if (cycling) return;
  Shelly.call(
    "HTTP.GET",
    { url: TARGET_URL, timeout: 5 },
    function (res, err_code) {
      let ok =
        err_code === 0 && res && (res.code === 200 || res.code === 204);
      if (ok) {
        failCount = 0;
        return;
      }
      failCount = failCount + 1;
      print("[TiSLY] 疎通失敗 ", failCount, "/", FAIL_LIMIT);
      if (failCount >= FAIL_LIMIT) {
        powerCycle();
      }
    }
  );
}

Timer.set(INTERVAL_MS, true, checkTarget);
print("[TiSLY] ローカル自律Ping監視を開始");

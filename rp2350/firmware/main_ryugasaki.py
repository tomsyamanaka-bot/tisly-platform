"""
ウォッシュメイト龍ヶ崎店の起動ループ。
入力は通知だけ。回転灯とベルは
遠隔コマンドの秒数だけ動かす。
"""

import time

try:
    import urequests
except ImportError:
    urequests = None

try:
    import config as cfg
except ImportError:
    import config_ryugasaki as cfg

import ryugasaki_security as logic

try:
    from machine import Pin
except ImportError:
    Pin = None


def init_output_pins():
    """RO1 と RO2 を消灯で初期化する。"""
    pins = {}
    if Pin is None:
        return pins
    for ch, gpio in cfg.CH_GPIO.items():
        if ch not in (1, 2):
            continue
        pin = Pin(gpio, Pin.OUT)
        pin.value(0)
        pins[ch] = pin
    return pins


def init_input_pins():
    """DI1 から DI3 をプルアップ入力にする。"""
    pins = {}
    if Pin is None:
        return pins
    for ch in (1, 2, 3):
        gpio = cfg.DI_GPIO[ch]
        pins[ch] = Pin(gpio, Pin.IN, Pin.PULL_UP)
    return pins


def read_levels(pins):
    """アクティブ Low の接点を真偽にする。"""
    levels = {}
    for ch, pin in pins.items():
        low = pin.value() == 0
        levels[ch] = low if cfg.DI_ACTIVE_LOW else (not low)
    return levels


def write_outputs(pins, outputs):
    """HIGH でコイル ON。指定秒のあと消す。"""
    for ch, pin in pins.items():
        pin.value(1 if outputs.get(ch) else 0)


def http_json(method, path, payload=None):
    """VPS へ JSON を送り、応答を辞書で返す。"""
    if urequests is None:
        return None
    url = "{}{}".format(cfg.API_BASE, path)
    headers = {
        "Content-Type": "application/json",
        "X-Remote-Test-Token": cfg.REMOTE_TEST_TOKEN,
    }
    res = None
    try:
        if method == "GET":
            res = urequests.get(url, headers=headers)
        else:
            res = urequests.post(url, json=payload, headers=headers)
        if res.status_code >= 400:
            return None
        return res.json()
    except Exception as exc:
        print("[ryugasaki] http", exc)
        return None
    finally:
        if res is not None:
            try:
                res.close()
            except Exception:
                pass


def apply_cloud(ctrl, body, now_ms):
    """設定秒と命令を、届いた JSON から反映する。"""
    if not isinstance(body, dict):
        return
    settings = body.get("settings")
    if isinstance(settings, dict):
        ctrl.update_timing(
            settings.get("di3ConfirmMs"),
            settings.get("do1DurationSec"),
            settings.get("do2DurationSec"),
        )
    command = body.get("command")
    if command:
        ctrl.apply_remote_command(
            command,
            body.get("channels"),
            body.get("durationSec"),
            now_ms,
        )


def init_network():
    """有線 LAN を起動する。失敗してもループは続ける。"""
    try:
        from ethernet_init import ethernet_init

        return ethernet_init()
    except Exception as exc:
        print("[ryugasaki] ethernet", exc)
        return None


def show_shipping_led():
    """出荷状態の緑を出す。未搭載なら無視する。"""
    try:
        import tisly_rgb

        tisly_rgb.init_rgb(pin_no=cfg.RGB_LED_PIN, count=cfg.RGB_LED_COUNT)
        tisly_rgb.set_status("shippable")
        tisly_rgb.tick()
    except Exception:
        pass


def main():
    """入力監視、命令取得、心拍を繰り返す。"""
    outputs = init_output_pins()
    inputs = init_input_pins()
    ctrl = logic.RyugasakiController(cfg.DI_DEBOUNCE_MS)
    wdt = logic.init_watchdog(cfg.WDT_TIMEOUT_MS)
    init_network()
    show_shipping_led()
    now = time.ticks_ms()
    if inputs:
        ctrl.seed_inputs(read_levels(inputs), now)
    next_cmd = now
    next_hb = now
    while True:
        now = time.ticks_ms()
        logic.kick_watchdog(wdt)
        if inputs:
            events = ctrl.poll_inputs(read_levels(inputs), now)
            for event in events:
                http_json("POST", "/api/home/v1/ryugasaki/event", event)
        ctrl.tick_outputs(now)
        write_outputs(outputs, ctrl.outputs)
        if time.ticks_diff(now, next_cmd) >= 0:
            body = http_json("GET", "/api/home/v1/ryugasaki/command")
            apply_cloud(ctrl, body, now)
            write_outputs(outputs, ctrl.outputs)
            next_cmd = time.ticks_add(now, cfg.COMMAND_POLL_MS)
        if time.ticks_diff(now, next_hb) >= 0:
            payload = logic.build_heartbeat_payload()
            body = http_json(
                "POST", "/api/home/v1/ryugasaki/heartbeat", payload
            )
            apply_cloud(ctrl, body, now)
            write_outputs(outputs, ctrl.outputs)
            next_hb = time.ticks_add(
                now, cfg.HEARTBEAT_INTERVAL_SEC * 1000
            )
        try:
            import tisly_rgb

            tisly_rgb.tick(now)
        except Exception:
            pass
        time.sleep_ms(20)


if __name__ == "__main__":
    main()

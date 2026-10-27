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

_wdt_ref = None
_event_queue = []


def _kick():
    """通信待ちの途中でもウォッチドッグを蹴る。"""
    try:
        logic.kick_watchdog(_wdt_ref)
    except Exception:
        pass


def open_pin(gpio, mode):
    """不正な GPIO でも起動を止めず、その端子だけ飛ばす。"""
    if Pin is None:
        return None
    try:
        number = int(gpio)
    except Exception:
        print("[ryugasaki] gpio", gpio)
        return None
    if number < 0 or number > 47:
        print("[ryugasaki] gpio out of range", number)
        return None
    try:
        if mode == "out":
            pin = Pin(number, Pin.OUT)
            pin.value(0)
            return pin
        # オープンは High、ショートは Low
        pull = Pin.PULL_UP
        if not bool(getattr(cfg, "DI_ACTIVE_LOW", True)):
            pull = Pin.PULL_DOWN
        pin = Pin(number, Pin.IN, pull)
        try:
            pin.init(Pin.IN, pull)
        except Exception:
            pass
        return pin
    except Exception as exc:
        print("[ryugasaki] pin", number, exc)
        return None


def init_output_pins():
    """RO1 と RO2 を消灯で初期化する。"""
    pins = {}
    for ch, gpio in cfg.CH_GPIO.items():
        if ch not in (1, 2):
            continue
        pin = open_pin(gpio, "out")
        if pin is not None:
            pins[ch] = pin
    return pins


def init_input_pins():
    """DI1〜DI3。アクティブLowならプルアップ。"""
    pins = {}
    for ch in (1, 2, 3):
        pin = open_pin(cfg.DI_GPIO[ch], "in")
        if pin is not None:
            pins[ch] = pin
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
    _kick()
    try:
        import socket

        socket.setdefaulttimeout(3)
    except Exception:
        pass
    try:
        if method == "GET":
            try:
                res = urequests.get(url, headers=headers, timeout=3)
            except TypeError:
                res = urequests.get(url, headers=headers)
        else:
            try:
                res = urequests.post(
                    url, json=payload, headers=headers, timeout=3
                )
            except TypeError:
                res = urequests.post(url, json=payload, headers=headers)
        if res.status_code >= 400:
            return None
        return res.json()
    except Exception as exc:
        print("[ryugasaki] http", exc)
        return None
    finally:
        _kick()
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


_link_online = None


def show_boot_led():
    """DHCP 中は青。通信失敗の赤とは分けて出す。"""
    global _link_online
    if _link_online == "boot":
        return
    _link_online = "boot"
    try:
        import tisly_rgb

        tisly_rgb.init_rgb(pin_no=cfg.RGB_LED_PIN, count=cfg.RGB_LED_COUNT)
        tisly_rgb.set_status("boot")
        tisly_rgb.tick()
    except Exception:
        pass


def set_link_led(online):
    """通信エラーは赤点滅、オンライン時は緑点滅を維持する。"""
    global _link_online
    if _link_online is online:
        return
    _link_online = online
    try:
        import tisly_rgb

        tisly_rgb.init_rgb(pin_no=cfg.RGB_LED_PIN, count=cfg.RGB_LED_COUNT)
        tisly_rgb.set_status("ok" if online else "error")
        tisly_rgb.tick()
    except Exception:
        pass


def init_network(wdt):
    """W5500 初期化や DHCP 失敗でも予備 IP へ戻して続ける。"""
    static = (
        cfg.STATIC_IP,
        cfg.STATIC_MASK,
        cfg.STATIC_GATEWAY,
        cfg.STATIC_DNS,
    )
    timeout = int(getattr(cfg, "DHCP_TIMEOUT_SEC", 5))
    if timeout > 5:
        timeout = 5
    try:
        from ethernet_init import ethernet_init

        info = ethernet_init(
            static=static,
            kick=lambda: logic.kick_watchdog(wdt),
            timeout_sec=timeout,
        )
        print("[ryugasaki] network", info)
        return info
    except Exception as exc:
        print("[ryugasaki] ethernet", exc)
        return None


def post_heartbeat(ctrl, outputs, wdt):
    """心拍を1回送る。失敗しても例外は外へ出さない。"""
    now = time.ticks_ms()
    logic.kick_watchdog(wdt)
    try:
        payload = logic.build_heartbeat_payload()
        body = http_json(
            "POST", "/api/home/v1/ryugasaki/heartbeat", payload
        )
    except Exception as exc:
        print("[ryugasaki] heartbeat", exc)
        set_link_led(False)
        return False
    if not isinstance(body, dict):
        set_link_led(False)
        return False
    set_link_led(True)
    apply_cloud(ctrl, body, now)
    write_outputs(outputs, ctrl.outputs)
    offer_ota(body)
    return True


def ota_http_get(path):
    """OTA 用の GET。本文と番号を返す。"""
    if urequests is None:
        return None, 0
    url = "{}{}".format(cfg.API_BASE, path)
    headers = {"X-Remote-Test-Token": cfg.REMOTE_TEST_TOKEN}
    res = None
    _kick()
    try:
        import socket

        socket.setdefaulttimeout(4)
    except Exception:
        pass
    try:
        try:
            res = urequests.get(url, headers=headers, timeout=4)
        except TypeError:
            res = urequests.get(url, headers=headers)
        return res.text, res.status_code
    except Exception as exc:
        print("[ryugasaki] ota http", exc)
        return None, 0
    finally:
        _kick()
        if res is not None:
            try:
                res.close()
            except Exception:
                pass


def offer_ota(body):
    """予約があるときだけ受け取る。強制はしない。"""
    if not isinstance(body, dict):
        return
    try:
        from tisly_ota import has_ota_update_from_body, maybe_update
    except ImportError:
        try:
            from lib.tisly_ota import (
                has_ota_update_from_body,
                maybe_update,
            )
        except ImportError:
            return
    try:
        import json

        raw = json.dumps(body)
    except Exception:
        return
    if not has_ota_update_from_body(raw):
        return
    try:
        maybe_update(
            ota_http_get,
            config=cfg,
            kick_wdt=_kick,
            reported_version=logic.FIRMWARE_LOGIC_VERSION,
        )
    except Exception as exc:
        print("[ryugasaki] ota", exc)


def wait_heartbeat_retry(wdt):
    """10秒待って再送する。WDT は1秒ごとに蹴る。"""
    left = 10
    while left > 0:
        logic.kick_watchdog(wdt)
        time.sleep(1)
        left -= 1


def heartbeat_with_retry(ctrl, outputs, wdt):
    """失敗したら10秒後に再試行し、ループ自体は止めない。"""
    attempt = 0
    while attempt < 3:
        attempt += 1
        if post_heartbeat(ctrl, outputs, wdt):
            return True
        if attempt < 3:
            print("[ryugasaki] heartbeat retry in 10s")
            wait_heartbeat_retry(wdt)
    return False


def _hold(wdt):
    """例外後も再起動せず、1秒ごとに監視タイマーだけを蹴る。"""
    while True:
        try:
            logic.kick_watchdog(wdt)
        except Exception:
            pass
        time.sleep(1)


def enqueue_events(events):
    """変化を捨てず、送信できるまで残す。"""
    for event in events:
        print(
            "[ryugasaki] di",
            event.get("di"),
            "active",
            event.get("active"),
        )
        _event_queue.append(event)
    if len(_event_queue) > 16:
        del _event_queue[:-16]


def flush_one_event():
    """先頭の DI 変化をすぐ POST する。失敗は残す。"""
    if not _event_queue:
        return
    posted = http_json(
        "POST",
        "/api/home/v1/ryugasaki/event",
        _event_queue[0],
    )
    if posted is None:
        set_link_led(False)
        print("[ryugasaki] event retry")
        return
    _event_queue.pop(0)
    set_link_led(True)


def _service_once(ctrl, inputs, outputs, wdt, next_cmd, next_hb):
    """1周分。通信失敗は赤、成功は緑にする。"""
    now = time.ticks_ms()
    logic.kick_watchdog(wdt)
    if inputs:
        events = ctrl.poll_inputs(read_levels(inputs), now)
        if events:
            enqueue_events(events)
        flush_one_event()
    ctrl.tick_outputs(now)
    write_outputs(outputs, ctrl.outputs)
    if time.ticks_diff(now, next_cmd) >= 0:
        body = http_json("GET", "/api/home/v1/ryugasaki/command")
        if body is None:
            set_link_led(False)
        else:
            set_link_led(True)
            apply_cloud(ctrl, body, now)
            write_outputs(outputs, ctrl.outputs)
        next_cmd = time.ticks_add(now, cfg.COMMAND_POLL_MS)
    if time.ticks_diff(now, next_hb) >= 0:
        heartbeat_with_retry(ctrl, outputs, wdt)
        next_hb = time.ticks_add(
            time.ticks_ms(), cfg.HEARTBEAT_INTERVAL_SEC * 1000
        )
    try:
        import tisly_rgb

        tisly_rgb.tick(now)
    except Exception:
        pass
    time.sleep_ms(20)
    return next_cmd, next_hb


def _run():
    """入力監視、命令取得、心拍を繰り返す。"""
    global _wdt_ref
    outputs = init_output_pins()
    inputs = init_input_pins()
    ctrl = logic.RyugasakiController(cfg.DI_DEBOUNCE_MS)
    show_boot_led()
    init_network(None)
    wdt = logic.init_watchdog(cfg.WDT_TIMEOUT_MS)
    _wdt_ref = wdt
    now = time.ticks_ms()
    if inputs:
        ctrl.seed_inputs(read_levels(inputs), now)
    next_cmd = now
    print("[ryugasaki] boot heartbeat 0sec")
    heartbeat_with_retry(ctrl, outputs, wdt)
    next_hb = time.ticks_add(
        time.ticks_ms(), cfg.HEARTBEAT_INTERVAL_SEC * 1000
    )
    while True:
        try:
            next_cmd, next_hb = _service_once(
                ctrl, inputs, outputs, wdt, next_cmd, next_hb
            )
        except Exception as exc:
            print("[ryugasaki] loop", exc)
            set_link_led(False)
            print("[ryugasaki] retry loop in 10s")
            wait_heartbeat_retry(wdt)


def main():
    """起動失敗でも再起動せず、10秒後に初期化からやり直す。"""
    while True:
        try:
            _run()
        except Exception as exc:
            print("[ryugasaki] boot guard", exc)
            set_link_led(False)
            print("[ryugasaki] retry boot in 10s")
            wait_heartbeat_retry(_wdt_ref)


if __name__ == "__main__":
    main()

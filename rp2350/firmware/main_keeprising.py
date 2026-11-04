"""
Keep Rising の起動ループ。
センサーとリレーを先に回し、
通信失敗でもその周回を止めない。
"""

import time

try:
    import urequests
except ImportError:
    urequests = None

try:
    import config as cfg
except ImportError:
    import config_keeprising as cfg

import keeprising_security as logic

try:
    from machine import Pin
except ImportError:
    Pin = None

_wdt_ref = None
_event_queue = []
_scan_ref = None
_net_ok = False
_link_kind = None


def _arm_usb():
    """USB 初期化後に、ホストが無いときだけログを捨てる。"""
    try:
        import tisly_usb_safe
    except ImportError:
        try:
            from lib import tisly_usb_safe
        except Exception:
            return
    try:
        tisly_usb_safe.arm()
    except Exception:
        pass


def _paint(kind):
    """赤=未接続、青=疎通待ち、緑=心拍 OK。同じ色は書き直さない。"""
    global _link_kind
    if kind == _link_kind:
        return
    _link_kind = kind
    try:
        import tisly_rgb
    except ImportError:
        try:
            from lib import tisly_rgb
        except Exception:
            return
    try:
        tisly_rgb.init_rgb(
            pin_no=getattr(cfg, "RGB_LED_PIN", 2),
            count=getattr(cfg, "RGB_LED_COUNT", 1),
        )
        tisly_rgb.set_status(kind)
    except Exception:
        pass


def _paint_tick(now):
    """点滅の更新。失敗してもリレーは止めない。"""
    try:
        import tisly_rgb

        tisly_rgb.tick(now)
    except Exception:
        pass


def _kick():
    """通信待ちの途中でも監視と WDT を進める。"""
    try:
        logic.kick_watchdog(_wdt_ref)
    except Exception:
        pass
    scan = _scan_ref
    if scan is None:
        return
    try:
        scan()
    except Exception:
        pass


def open_pin(gpio, mode):
    """不正な GPIO でも起動を止めず、その端子だけ飛ばす。"""
    if Pin is None:
        return None
    try:
        number = int(gpio)
    except Exception:
        print("[keeprising] gpio", gpio)
        return None
    if number < 0 or number > 47:
        print("[keeprising] gpio out of range", number)
        return None
    try:
        if mode == "out":
            pin = Pin(number, Pin.OUT)
            pin.value(0)
            return pin
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
        print("[keeprising] pin", number, exc)
        return None


def init_output_pins():
    """DO1〜DO7 を消灯で初期化する。"""
    pins = {}
    for ch, gpio in cfg.CH_GPIO.items():
        if ch not in logic.OUTPUT_CHANNELS:
            continue
        pin = open_pin(gpio, "out")
        if pin is not None:
            pins[ch] = pin
    return pins


def init_input_pins():
    """DI1〜DI4。アクティブ Low ならプルアップ。"""
    pins = {}
    for ch in (1, 2, 3, 4):
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


def write_outputs(pins, levels):
    """HIGH でコイル ON。点滅もここへ渡す。"""
    for ch, pin in pins.items():
        pin.value(1 if levels.get(ch) else 0)


def load_cached_rules():
    """前回決定した設定。無ければ既定のまま。"""
    try:
        import json

        with open("keeprising_rules.json", "r") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {
        "scheduleStart": cfg.SCHEDULE_START,
        "scheduleEnd": cfg.SCHEDULE_END,
        "durationSec": cfg.DURATION_SEC,
        "floodModes": {
            "do1": "steady",
            "do2": "steady",
            "do3": "steady",
            "do7": "steady",
        },
    }


def save_cached_rules(rules):
    """回線が戻る前の判断用に設定を残す。"""
    if not isinstance(rules, dict):
        return
    try:
        import json

        with open("keeprising_rules.json", "w") as handle:
            json.dump(rules, handle)
    except Exception as exc:
        print("[keeprising] rules", exc)


def http_json(method, path, payload=None):
    """VPS へ JSON。失敗は None。リレーは呼ばない。"""
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

        socket.setdefaulttimeout(1)
    except Exception:
        pass
    try:
        if method == "GET":
            try:
                res = urequests.get(url, headers=headers, timeout=1)
            except TypeError:
                res = urequests.get(url, headers=headers)
        else:
            try:
                res = urequests.post(
                    url, json=payload, headers=headers, timeout=1
                )
            except TypeError:
                res = urequests.post(url, json=payload, headers=headers)
        if res.status_code >= 400:
            return None
        try:
            return res.json()
        except Exception:
            return {"ok": True}
    except Exception as exc:
        print("[keeprising] http", exc)
        return None
    finally:
        _kick()
        if res is not None:
            try:
                res.close()
            except Exception:
                pass


def enqueue_events(events):
    """未送信の検知を残す。出力とは独立。"""
    for event in events or []:
        _event_queue.append(event)
    while len(_event_queue) > 20:
        _event_queue.pop(0)


def flush_one_event():
    """先頭を 1 件送る。失敗してもキューは残す。"""
    if not _event_queue:
        return
    posted = http_json(
        "POST", "/api/home/v1/keeprising/event", _event_queue[0]
    )
    if posted is None:
        print("[keeprising] event retry")
        return
    _event_queue.pop(0)


def apply_cloud(ctrl, body, now_ms):
    """決定済み設定と日中テストを反映する。"""
    if not isinstance(body, dict):
        return
    settings = body.get("settings")
    if isinstance(settings, dict):
        save_cached_rules(settings)
    ctrl.apply_command(body, now_ms)


def poll_and_drive(ctrl, inputs, outputs):
    """通信より先に入力を見てコイルを書く。"""
    try:
        now = time.ticks_ms()
    except Exception:
        now = 0
    try:
        utc = time.time()
    except Exception:
        utc = None
    events = []
    if inputs:
        try:
            events = ctrl.poll_inputs(read_levels(inputs), now, utc)
        except Exception as exc:
            print("[keeprising] di", exc)
            events = []
    if events:
        enqueue_events(events)
    try:
        write_outputs(outputs, ctrl.physical(now, utc))
    except Exception as exc:
        print("[keeprising] do", exc)
    return now


def init_network(wdt):
    """DHCP を短く試し、失敗したら予備 IP へ戻す。"""
    static = (
        cfg.STATIC_IP,
        cfg.STATIC_MASK,
        cfg.STATIC_GATEWAY,
        cfg.STATIC_DNS,
    )
    timeout = int(getattr(cfg, "DHCP_TIMEOUT_SEC", 5))
    try:
        from ethernet_init import ethernet_init

        info = ethernet_init(
            static=static,
            kick=lambda: logic.kick_watchdog(wdt) or _kick(),
            timeout_sec=timeout,
            wait_for_ip=True,
        )
        print("[keeprising] network", info)
        return info
    except Exception as exc:
        print("[keeprising] ethernet", exc)
        return None


def ota_http_get(path):
    """OTA 用の GET。失敗してもリレーは触らない。"""
    if urequests is None:
        return None, 0
    url = "{}{}".format(cfg.API_BASE, path)
    headers = {"X-Remote-Test-Token": cfg.REMOTE_TEST_TOKEN}
    res = None
    _kick()
    try:
        try:
            res = urequests.get(url, headers=headers, timeout=1)
        except TypeError:
            res = urequests.get(url, headers=headers)
        return res.text, res.status_code
    except Exception as exc:
        print("[keeprising] ota http", exc)
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
        print("[keeprising] ota", exc)


def _service_once(ctrl, inputs, outputs, next_cmd, next_hb):
    """1周。先にリレー、そのあと通信。"""
    now = poll_and_drive(ctrl, inputs, outputs)
    logic.kick_watchdog(_wdt_ref)
    try:
        due_cmd = time.ticks_diff(now, next_cmd) >= 0
    except Exception:
        due_cmd = True
    if due_cmd:
        body = http_json("GET", "/api/home/v1/keeprising/command")
        if isinstance(body, dict):
            apply_cloud(ctrl, body, now)
        poll_and_drive(ctrl, inputs, outputs)
        try:
            next_cmd = time.ticks_add(now, cfg.COMMAND_POLL_MS)
        except Exception:
            next_cmd = now + cfg.COMMAND_POLL_MS
    try:
        flush_one_event()
    except Exception as exc:
        print("[keeprising] event", exc)
    try:
        due_hb = time.ticks_diff(now, next_hb) >= 0
    except Exception:
        due_hb = False
    if due_hb:
        payload = logic.build_heartbeat_payload()
        body = http_json(
            "POST", "/api/home/v1/keeprising/heartbeat", payload
        )
        if isinstance(body, dict):
            _paint("green")
            apply_cloud(ctrl, body, now)
            offer_ota(body)
            try:
                next_hb = time.ticks_add(
                    time.ticks_ms(), cfg.HEARTBEAT_INTERVAL_SEC * 1000
                )
            except Exception:
                next_hb = now + cfg.HEARTBEAT_INTERVAL_SEC * 1000
        else:
            if _net_ok:
                _paint("blue")
            else:
                _paint("red")
            try:
                next_hb = time.ticks_add(now, 5000)
            except Exception:
                next_hb = now + 5000
        poll_and_drive(ctrl, inputs, outputs)
    try:
        _paint_tick(now)
    except Exception:
        pass
    try:
        time.sleep_ms(20)
    except Exception:
        pass
    return next_cmd, next_hb


def _run():
    """入力監視を通信より先に始める。"""
    global _wdt_ref, _scan_ref, _net_ok
    _arm_usb()
    _paint("red")
    outputs = init_output_pins()
    inputs = init_input_pins()
    ctrl = logic.KeepRisingController(cfg.DI_DEBOUNCE_MS)
    ctrl.apply_rules(load_cached_rules())
    _paint("blue")
    wdt = logic.init_watchdog(cfg.WDT_TIMEOUT_MS)
    _wdt_ref = wdt

    def scan():
        poll_and_drive(ctrl, inputs, outputs)

    _scan_ref = scan
    try:
        now = time.ticks_ms()
    except Exception:
        now = 0
    if inputs:
        ctrl.seed_inputs(read_levels(inputs), now)
    poll_and_drive(ctrl, inputs, outputs)
    info = None
    try:
        info = init_network(wdt)
    except Exception as exc:
        print("[keeprising] ethernet", exc)
        info = None
    _net_ok = bool(info)
    _paint("blue" if _net_ok else "red")
    poll_and_drive(ctrl, inputs, outputs)
    next_cmd = now
    next_hb = now
    while True:
        try:
            next_cmd, next_hb = _service_once(
                ctrl, inputs, outputs, next_cmd, next_hb
            )
        except Exception as exc:
            print("[keeprising] loop", exc)
            poll_and_drive(ctrl, inputs, outputs)


def main():
    """起動失敗でも再起動せず、監視からやり直す。"""
    while True:
        try:
            _run()
        except Exception as exc:
            print("[keeprising] boot guard", exc)
            try:
                time.sleep_ms(200)
            except Exception:
                pass


if __name__ == "__main__":
    main()

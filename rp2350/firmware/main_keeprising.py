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
    """DO1〜DO8 を消灯で初期化する。"""
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


def _load_do_guard():
    """通電ガード。無くてもセンサー連動は続ける。"""
    try:
        import tisly_do_guard as mod
        return mod
    except ImportError:
        try:
            from lib import tisly_do_guard as mod
            return mod
        except ImportError:
            return None


_do_mod = _load_do_guard()
_do_guard = _do_mod.DoGuard("keeprising") if _do_mod else None
try:
    _boot_ms = time.ticks_ms()
except Exception:
    _boot_ms = 0
_reset_reason = "UNKNOWN"
if _do_mod:
    try:
        _reset_reason = _do_mod.read_reset_reason()
    except Exception:
        _reset_reason = "UNKNOWN"


def _boot_do_off():
    """ネットワークより前に全DOを切る。"""
    if not _do_mod:
        return
    try:
        _do_mod.boot_all_do_off(getattr(cfg, "CH_GPIO", None))
    except Exception:
        pass


def write_outputs(pins, levels):
    """HIGH でコイル ON。上限を超えたら切る。"""
    try:
        now = time.ticks_ms()
    except Exception:
        now = 0
    for ch, pin in pins.items():
        desired = bool(levels.get(ch))
        if _do_guard:
            try:
                before = len(_do_guard.pending)
                if not _do_guard.allow(ch, desired, now):
                    if desired and len(_do_guard.pending) > before:
                        print("[keeprising] DO", ch, "limit")
                    desired = False
            except Exception:
                pass
        pin.value(1 if desired else 0)


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
        "beamLinkMode": getattr(cfg, "BEAM_LINK_MODE", "staged_steady"),
        "stageWindowSec": int(getattr(cfg, "STAGE_WINDOW_SEC", 60)),
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

        socket.setdefaulttimeout(4)
    except Exception:
        pass
    try:
        if method == "GET":
            try:
                res = urequests.get(url, headers=headers, timeout=4)
            except TypeError:
                res = urequests.get(url, headers=headers)
        else:
            try:
                res = urequests.post(
                    url, json=payload, headers=headers, timeout=4
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


def _absorb_clock(ctrl, body):
    """サーバーの日本時間。NTP 前の判定に使う。"""
    if not isinstance(body, dict):
        return
    raw = body.get("jstMinutes", body.get("jst_minutes"))
    settings = body.get("settings")
    if raw is None and isinstance(settings, dict):
        raw = settings.get("jstMinutes", settings.get("jst_minutes"))
    if raw is None:
        return
    try:
        ctrl.note_server_jst(raw)
    except Exception:
        pass


def _boot_wait(ms=2000):
    """起動後2秒。待ちは細かく給餌する。"""
    left = int(ms)
    while left > 0:
        step = 200 if left > 200 else left
        _kick()
        try:
            time.sleep_ms(step)
        except Exception:
            pass
        left -= step


def apply_cloud(ctrl, body, now_ms):
    """決定済み設定と日中テストを反映する。"""
    if not isinstance(body, dict):
        return
    _absorb_clock(ctrl, body)
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
    """DHCP を短く試し、失敗したら予備 IP へ戻す。

    DHCP の中では給餌できない。
    別スレッドに逃がし、こちらで 200ms ごとに蹴る。
    """
    static = (
        cfg.STATIC_IP,
        cfg.STATIC_MASK,
        cfg.STATIC_GATEWAY,
        cfg.STATIC_DNS,
    )
    timeout = int(getattr(cfg, "DHCP_TIMEOUT_SEC", 5))

    def once():
        from ethernet_init import ethernet_init

        return ethernet_init(
            static=static,
            kick=lambda: logic.kick_watchdog(wdt),
            timeout_sec=timeout,
            wait_for_ip=True,
        )

    try:
        import _thread
    except Exception:
        _thread = None
    if _thread is None:
        try:
            info = once()
            print("[keeprising] network", info)
            return info
        except Exception as exc:
            print("[keeprising] ethernet", exc)
            return None

    box = {}

    def worker():
        try:
            box["info"] = once()
        except Exception as exc:
            box["err"] = exc
        box["done"] = True

    try:
        _thread.start_new_thread(worker, ())
    except Exception as exc:
        print("[keeprising] ethernet", exc)
        return None
    while "done" not in box:
        try:
            logic.kick_watchdog(wdt)
        except Exception:
            pass
        _kick()
        try:
            time.sleep_ms(200)
        except Exception:
            pass
    if "err" in box:
        print("[keeprising] ethernet", box["err"])
        return None
    info = box.get("info")
    print("[keeprising] network", info)
    return info


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
            res = urequests.get(url, headers=headers, timeout=4)
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
        extra = {}
        if _do_mod:
            try:
                cuts = _do_guard.pending_cuts() if _do_guard else None
                extra = _do_mod.health_payload(
                    _boot_ms, _reset_reason, cuts
                )
            except Exception:
                extra = {}
        payload = logic.build_heartbeat_payload(extra)
        body = http_json(
            "POST", "/api/home/v1/keeprising/heartbeat", payload
        )
        if isinstance(body, dict):
            _paint("green")
            try:
                logic.sync_ntp()
            except Exception:
                pass
            _absorb_clock(ctrl, body)
            if _do_guard:
                try:
                    _do_guard.clear_pending()
                except Exception:
                    pass
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
    _boot_do_off()
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
    _boot_wait(2000)
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

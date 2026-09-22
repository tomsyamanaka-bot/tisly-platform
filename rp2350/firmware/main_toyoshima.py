"""
豊島邸 RP2350 ファームウェア — 実機 main.py 用

Waveshare RP2350-POE-ETH-8DI-8RO / MicroPython
母屋（主装置 8ch）・はなれ（子機 6ch）を BUILDING で切替。

機能:
- DI 100ms デバウンス + 遠近2段階ライト / フラッシュ
- クラウド同期 security_mode / light_schedule
- 5 分 heartbeat（board_temp / 過熱フラグ）
- 命令 long-poll waitMs + HB 同梱で即時リレー
- 物理 WDT 8 秒
- VPS /api/home/v1/toyoshima へイベント送信
"""

import json
import time

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

from machine import Pin


def _safe_print(*parts):
    """print 例外（端末エンコード等）で起動を落とさない。"""
    try:
        print(*parts)
    except Exception:
        try:
            text = " ".join([str(p) for p in parts])
            print(text.encode("ascii", "replace").decode("ascii"))
        except Exception:
            pass


# セーフモード（赤ランプ固定＝遠隔復旧不能を避ける）
SAFE_MODE = False
SAFE_MODE_REASON = ""


class _FallbackConfig:
    """config.py が壊れていても LAN と OTA だけは生かす最小設定。"""

    API_BASE = "https://tisly.jp"
    TENANT_ID = "TOYOSHIMA001"
    SITE_ID = "SEC-JP-TOYOSHIMA-001"
    HOME_SITE_ID = "HOME-JP-TOYOSHIMA"
    BUILDING = "main"
    REMOTE_TEST_TOKEN = "tisly2026test"
    DEVICE_ID = "rp2350-toyoshima-main-01"
    SECURITY_RULES_SITE_ID = "HOME-JP-TOYOSHIMA"
    SECURITY_RULES_SYNC_EVERY = 10
    POLL_INTERVAL_SEC = 3
    HEARTBEAT_INTERVAL_SEC = 300
    WDT_TIMEOUT_MS = 8000
    DHCP_TIMEOUT_SEC = 12
    RGB_LED_PIN = 2
    RGB_LED_COUNT = 1
    CH_GPIO = {1: 17, 2: 18, 3: 19, 4: 20, 5: 21, 6: 22, 7: 23, 8: 24}
    DI_GPIO = {1: 9, 2: 10, 3: 11, 4: 12, 5: 13, 6: 14, 7: 15, 8: 16}
    DI_ACTIVE_LOW = True
    DI_DEBOUNCE_MS = 100
    FIRMWARE_VERSION = "safe-mode"
    OTA_SITE = "toyoshima"
    OTA_VERSION = "0.0.0"
    OTA_CHANNEL = "production"


try:
    import config
except Exception as _config_exc:
    SAFE_MODE = True
    SAFE_MODE_REASON = "config: {}".format(_config_exc)
    _safe_print("[toyoshima] config.py load failed - fallback:", _config_exc)
    config = _FallbackConfig()

try:
    from toyoshima_security import (
        BOARD_TEMP_OVERHEAT_C,
        DI_DEBOUNCE_MS,
        FIRMWARE_LOGIC_VERSION,
        HEARTBEAT_INTERVAL_SEC,
        SITE_ID,
        TENANT_ID,
        ToyoshimaDetachedController,
        ToyoshimaMainHouseController,
        WDT_TIMEOUT_MS,
        build_heartbeat_payload,
        init_watchdog,
        kick_watchdog,
        read_board_temperature_c,
        send_heartbeat_with_retry,
        send_toyoshima_event,
        send_toyoshima_heartbeat,
    )
except Exception as _logic_exc:
    # 制御ロジックが壊れても OTA 待機だけは動かす。
    SAFE_MODE = True
    SAFE_MODE_REASON = "logic: {}".format(_logic_exc)
    _safe_print("[toyoshima] logic load failed - safe mode:", _logic_exc)

    BOARD_TEMP_OVERHEAT_C = 60.0
    DI_DEBOUNCE_MS = 100
    FIRMWARE_LOGIC_VERSION = "safe-mode"
    HEARTBEAT_INTERVAL_SEC = 300
    SITE_ID = "SEC-JP-TOYOSHIMA-001"
    TENANT_ID = "TOYOSHIMA001"
    WDT_TIMEOUT_MS = 8000
    ToyoshimaDetachedController = None
    ToyoshimaMainHouseController = None

    def build_heartbeat_payload(
        building, site_id=None, device_id=None, extra=None
    ):
        payload = {
            "building": building,
            "siteId": site_id or SITE_ID,
            "deviceId": device_id,
            "tenantId": TENANT_ID,
            "safe_mode": True,
        }
        if extra:
            payload.update(extra)
        return payload

    def init_watchdog(timeout_ms):
        try:
            from machine import WDT

            return WDT(timeout=int(timeout_ms))
        except Exception as exc:
            _safe_print("[toyoshima] WDT unavailable:", exc)
            return None

    def kick_watchdog(wdt):
        if wdt is None:
            return
        try:
            wdt.feed()
        except Exception:
            pass

    def read_board_temperature_c():
        return None

    def send_heartbeat_with_retry(send_fn, kick_wdt=None):
        try:
            return bool(send_fn())
        except Exception:
            return False

    def send_toyoshima_event(*_args, **_kwargs):
        return False

    def send_toyoshima_heartbeat(*_args, **_kwargs):
        return False

try:
    import urequests
except Exception:
    urequests = None

# 付帯モジュールの破損で main 全体を落とさない（ImportError 以外も捕捉）
try:
    from tisly_ota import has_ota_update_from_body
    from tisly_ota import local_version as ota_local_version
    from tisly_ota import mark_boot_ok
    from tisly_ota import maybe_update as ota_maybe_update
except Exception:
    try:
        from lib.tisly_ota import has_ota_update_from_body
        from lib.tisly_ota import local_version as ota_local_version
        from lib.tisly_ota import mark_boot_ok
        from lib.tisly_ota import maybe_update as ota_maybe_update
    except Exception as _ota_exc:
        _safe_print("[toyoshima] tisly_ota load failed:", _ota_exc)
        has_ota_update_from_body = None
        ota_local_version = None
        mark_boot_ok = None
        ota_maybe_update = None

try:
    from tisly_self_test import get_runner as get_kitting_runner
except Exception as _kit_exc:
    _safe_print("[toyoshima] tisly_self_test load failed:", _kit_exc)
    get_kitting_runner = None

# --- W5500 SPI ピン（Waveshare 準拠） ---
W5500_SPI_ID = 0
W5500_SCK = 34
W5500_MOSI = 35
W5500_MISO = 36
W5500_CS = 33
W5500_RST = 25


# --- Waveshare RP2350-POE-ETH-8DI-8RO 公式ピン配列 ---
# RO1〜RO8 = GPIO17〜24 / DI1〜DI8 = GPIO9〜16
# config.py は OTA skipFiles のため実機側が古いままになる。
# CH1/CH2 が欠落した config でも本テーブルで必ず生成する。
BOARD_CH_GPIO = {1: 17, 2: 18, 3: 19, 4: 20, 5: 21, 6: 22, 7: 23, 8: 24}
BOARD_DI_GPIO = {1: 9, 2: 10, 3: 11, 4: 12, 5: 13, 6: 14, 7: 15, 8: 16}


def _resolve_pin_map(attr_name, board_map, label):
    """公式配列を正とし、config 側のズレ・欠落を補正する。"""
    resolved = dict(board_map)
    cfg = getattr(config, attr_name, None)
    if isinstance(cfg, dict):
        for key, gpio in cfg.items():
            try:
                idx = int(key)
                gpio_no = int(gpio)
            except Exception:
                continue
            if idx in board_map and gpio_no != board_map[idx]:
                _safe_print(
                    "[toyoshima] {}{} GPIO{} -> official GPIO{}".format(
                        label, idx, gpio_no, board_map[idx]
                    )
                )
    return resolved


def _relay_gpio_level(channel, on):
    """論理ONをGPIOレベルへ変換する。
    豊島邸 Waveshare 8RO は HIGH=コイルON を強制する。
    skipFiles の config.py が RO_ACTIVE_LOW=True でも反転しない。
    """
    invert = False
    invert_map = getattr(config, "CH_INVERT", None)
    if invert_map:
        invert = bool(invert_map.get(channel, False))
    if invert:
        return 0 if on else 1
    return 1 if on else 0


def _channels_for_manual_cmd(cmd):
    """PWA 命令名から駆動 CH を決める。"""
    cmd = str(cmd or "").strip().lower()
    if cmd in (
        "do1_on",
        "do1_off",
        "ch1_on",
        "ch1_off",
        "light1_on",
        "light1_off",
        "sensor_far",
        "di1_alarm",
    ):
        return [1]
    if cmd in (
        "do2_on",
        "do2_off",
        "ch2_on",
        "ch2_off",
        "light2_on",
        "light2_off",
    ):
        return [2]
    if cmd in (
        "do3_on",
        "do3_off",
        "ch3_on",
        "ch3_off",
        "flash_on",
        "flash_off",
        "flash_test",
        "patlite_test",
    ):
        return [2] if _building() == "detached" else [3]
    if cmd in (
        "bulk_on",
        "bulk_off",
        "light_all_on",
        "light_all_off",
        "sensor_near",
        "di2_alarm",
    ):
        return [1] if _building() == "detached" else [1, 2, 3]
    return []


CH_GPIO_MAP = _resolve_pin_map("CH_GPIO", BOARD_CH_GPIO, "CH")
DI_GPIO_MAP = _resolve_pin_map("DI_GPIO", BOARD_DI_GPIO, "DI")

_di_active_low = bool(getattr(config, "DI_ACTIVE_LOW", True))
_di_pull = Pin.PULL_UP if _di_active_low else Pin.PULL_DOWN


def _init_relay_pins():
    """1本の GPIO 失敗で全停止しないよう CH 単位で保護する。"""
    pins = {}
    for ch in sorted(CH_GPIO_MAP.keys()):
        gpio = CH_GPIO_MAP[ch]
        try:
            pin = Pin(gpio, Pin.OUT)
            pin.value(_relay_gpio_level(ch, False))
            pins[ch] = pin
        except Exception as exc:
            _safe_print(
                "[toyoshima] CH{} GPIO{} init failed: {}".format(
                    ch, gpio, exc
                )
            )
    return pins


def _init_di_pins():
    """DI も 1 本ずつ保護して初期化する。"""
    pins = {}
    for di in sorted(DI_GPIO_MAP.keys()):
        gpio = DI_GPIO_MAP[di]
        try:
            pins[di] = Pin(gpio, Pin.IN, _di_pull)
        except Exception as exc:
            _safe_print(
                "[toyoshima] DI{} GPIO{} init failed: {}".format(
                    di, gpio, exc
                )
            )
    return pins


try:
    CH_PINS = _init_relay_pins()
except Exception as _ch_exc:
    SAFE_MODE = True
    SAFE_MODE_REASON = "relay init: {}".format(_ch_exc)
    _safe_print("[toyoshima] relay init failed - safe mode:", _ch_exc)
    CH_PINS = {}

try:
    DI_PINS = _init_di_pins()
except Exception as _di_exc:
    SAFE_MODE = True
    SAFE_MODE_REASON = "di init: {}".format(_di_exc)
    _safe_print("[toyoshima] DI init failed - safe mode:", _di_exc)
    DI_PINS = {}

ch_states = {str(i): "off" for i in range(1, 9)}
input_states = {str(i): "off" for i in range(1, 9)}

_lan = None
_security = None
_wdt = None
_rgb = None
_rgb_blink_on = False
_boot_ms = time.ticks_ms()
_last_hb_ok = False
_kit = None
_pending_hb_cmd = None
_pending_events = []
# DI サンプリングを HTTP 長待ちで潰さない。
# 命令は 0ms GET + 50ms idle で即時取得する。
COMMAND_WAIT_MS = 0
LOOP_IDLE_MS = 50
EVENT_RETRY_MS = 200


def log(msg):
    _safe_print("[豊島邸]", msg)


def log_error(msg):
    _safe_print("[豊島邸] error:", msg)


def _building():
    return str(getattr(config, "BUILDING", "main")).strip() or "main"


def _site_id():
    return str(getattr(config, "SITE_ID", SITE_ID))


def _device_id():
    return str(getattr(config, "DEVICE_ID", "rp2350-toyoshima-main-01"))


def _uptime_sec():
    return int(time.ticks_diff(time.ticks_ms(), _boot_ms) / 1000)


def init_rgb_led():
    """出荷判定 RGB と自己診断ランナーを起動。"""
    global _rgb, _kit
    if get_kitting_runner:
        try:
            _kit = get_kitting_runner(
                config=config,
                http_get=http_get,
                kick_wdt=lambda: kick_watchdog(_wdt),
            )
            _kit.run_config()
            log("kitting RGB status={}".format(_kit.status))
            return
        except Exception as e:
            _kit = None
            log_error("kitting init: {}".format(e))
    pin_no = int(getattr(config, "RGB_LED_PIN", 2))
    count = int(getattr(config, "RGB_LED_COUNT", 1))
    try:
        import neopixel

        _rgb = neopixel.NeoPixel(Pin(pin_no), count)
        set_rgb(0, 0, 40)
        log("RGB LED GPIO{} 初期化".format(pin_no))
    except Exception as e:
        _rgb = None
        log_error("RGB LED: {}".format(e))


def set_rgb(r, g, b):
    """RGB を即時反映（失敗は無視）。"""
    if _rgb is None:
        return
    try:
        _rgb[0] = (int(r), int(g), int(b))
        _rgb.write()
    except Exception:
        pass


def set_rgb_status(kind):
    """
    互換ラッパ。出荷判定ランナーがあれば
    そちらを優先し、無いときだけ直制御。
    """
    global _rgb_blink_on
    if _kit and kind != "safe":
        if kind == "error":
            _kit.note_heartbeat(False)
        elif kind == "ok":
            _kit.tick()
        else:
            _kit.apply_rgb()
        return
    if kind == "boot":
        set_rgb(0, 0, 48)
    elif kind == "ok":
        _rgb_blink_on = not _rgb_blink_on
        if _rgb_blink_on:
            set_rgb(0, 48, 0)
        else:
            set_rgb(0, 0, 0)
    elif kind == "safe":
        # 橙点滅 = セーフモードで OTA 待機中（赤固定と区別する）
        _rgb_blink_on = not _rgb_blink_on
        if _rgb_blink_on:
            set_rgb(48, 24, 0)
        else:
            set_rgb(0, 0, 0)
    elif kind == "error":
        set_rgb(48, 0, 0)
    else:
        set_rgb(0, 0, 48)


def _wait_lan(lan, timeout_sec=15):
    """DHCP 待ち中も WDT をキック。"""
    deadline = time.ticks_add(time.ticks_ms(), int(timeout_sec * 1000))
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        kick_watchdog(_wdt)
        if lan.isconnected():
            return True
        time.sleep_ms(200)
    return lan.isconnected()


def _apply_static_ip(nic):
    """DHCP 失敗時の固定 IP フォールバック。"""
    ip = str(getattr(config, "STATIC_IP", "192.168.1.235"))
    mask = str(getattr(config, "STATIC_MASK", "255.255.255.0"))
    gw = str(getattr(config, "STATIC_GATEWAY", "192.168.1.1"))
    dns = str(getattr(config, "STATIC_DNS", "8.8.8.8"))
    try:
        nic.ifconfig((ip, mask, gw, dns))
        log("固定IP適用: {} gw={}".format(ip, gw))
        time.sleep_ms(500)
        kick_watchdog(_wdt)
        return nic.ifconfig()
    except Exception as e:
        log_error("固定IP失敗: {}".format(e))
        return None


def init_ethernet():
    """DHCP → 失敗時固定IP の二重初期化。"""
    global _lan
    set_rgb_status("boot")
    log("Ethernet init（DHCP優先）")
    dhcp_sec = int(getattr(config, "DHCP_TIMEOUT_SEC", 12))

    try:
        import network

        if hasattr(network, "LAN"):
            lan = network.LAN()
            if not lan.isconnected():
                try:
                    lan.active(True)
                except Exception:
                    pass
                _wait_lan(lan, dhcp_sec)
            if not lan.isconnected():
                _apply_static_ip(lan)
                _wait_lan(lan, 5)
            if lan.isconnected():
                _lan = lan
                return lan.ifconfig()
    except Exception as e:
        log_error("network.LAN: {}".format(e))

    try:
        import network
        from machine import SPI, Pin as MPin

        spi = SPI(
            W5500_SPI_ID,
            baudrate=2_000_000,
            sck=MPin(W5500_SCK),
            mosi=MPin(W5500_MOSI),
            miso=MPin(W5500_MISO),
        )
        nic = network.WIZNET5K(
            spi, MPin(W5500_CS), MPin(W5500_RST)
        )
        nic.active(True)
        try:
            nic.ifconfig("dhcp")
        except TypeError:
            nic.ifconfig(
                ["0.0.0.0", "255.255.255.0", "0.0.0.0", "8.8.8.8"]
            )
        _wait_lan(nic, dhcp_sec)
        if not nic.isconnected():
            _apply_static_ip(nic)
            _wait_lan(nic, 5)
        if nic.isconnected():
            _lan = nic
            return nic.ifconfig()
    except Exception as e:
        log_error("network.WIZNET5K: {}".format(e))

    try:
        from ethernet_init import ethernet_init

        ifconfig = ethernet_init()
        if ifconfig and ifconfig[0] and ifconfig[0] != "0.0.0.0":
            return ifconfig
    except ImportError:
        pass
    except Exception as e:
        log_error("ethernet_init: {}".format(e))
    return None


def get_ip():
    if _lan is not None:
        try:
            if _lan.isconnected():
                cfg = _lan.ifconfig()
                if cfg and cfg[0] and cfg[0] != "0.0.0.0":
                    return cfg[0]
        except Exception:
            pass
    try:
        import socket

        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and ip != "0.0.0.0":
                return ip
        finally:
            s.close()
    except Exception as e:
        log_error("IP detect: {}".format(e))
    return None


def _http_headers(content_type=None):
    headers = {
        "X-Remote-Test-Token": getattr(
            config, "REMOTE_TEST_TOKEN", ""
        )
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def http_get(path):
    if urequests is None:
        log_error("urequests 未インストール")
        return None, 0
    url = config.API_BASE.rstrip("/") + path
    try:
        res = urequests.get(url, headers=_http_headers())
        status = res.status_code
        body = res.text
        res.close()
        return body, status
    except Exception as e:
        log_error("HTTP: {}".format(e))
        return None, 0


def _json_dumps_safe(payload):
    """絵文字などで dumps が落ちても ASCII に落とす。"""
    try:
        return json.dumps(payload)
    except Exception:
        pass
    safe = {}
    try:
        items = payload.items() if isinstance(payload, dict) else []
        for key, val in items:
            try:
                json.dumps({key: val})
                safe[key] = val
            except Exception:
                safe[key] = "DI detect"
        return json.dumps(safe)
    except Exception as exc:
        log_error("JSON encode: {}".format(exc))
        return "{}"


def http_post(path, payload):
    if urequests is None:
        log_error("urequests 未インストール")
        return None, 0
    url = config.API_BASE.rstrip("/") + path
    try:
        body = _json_dumps_safe(payload)
        res = urequests.post(
            url,
            headers=_http_headers("application/json"),
            data=body,
        )
        status = res.status_code
        text = res.text
        res.close()
        return text, status
    except Exception as e:
        log_error("HTTP POST: {}".format(e))
        return None, 0


def set_ch_output(channel, on):
    """リレー出力と ch_states を同期更新。
    HIGH でコイルON・DO青LED点灯。
    CH1/CH2 が未生成でも公式 GPIO で作り直す。
    """
    gpio = CH_GPIO_MAP.get(channel)
    if gpio is None:
        log_error("CH{} は未定義 — 駆動しない".format(channel))
        return
    if channel not in CH_PINS:
        CH_PINS[channel] = Pin(gpio, Pin.OUT)
        log("CH{} GPIO{} を遅延生成".format(channel, gpio))
    level = _relay_gpio_level(channel, on)
    CH_PINS[channel].value(level)
    ch_states[str(channel)] = "on" if on else "off"
    log(
        "CH{} GPIO{} -> {} (logic {})".format(
            channel,
            gpio,
            "HIGH" if level else "LOW",
            "ON" if on else "OFF",
        )
    )


def read_di_state(di):
    if di not in DI_PINS:
        return "off"
    raw = DI_PINS[di].value()
    if _di_active_low:
        return "on" if raw == 0 else "off"
    return "on" if raw == 1 else "off"


def poll_inputs():
    """DI をハードデバウンスして更新（既定 100ms）。"""
    changed = False
    edges = []
    debounce_ms = int(
        getattr(config, "DI_DEBOUNCE_MS", DI_DEBOUNCE_MS)
    )
    for di in sorted(DI_PINS.keys()):
        state = read_di_state(di)
        key = str(di)
        if input_states[key] != state:
            time.sleep_ms(debounce_ms)
            if read_di_state(di) != state:
                continue
            prev = input_states[key]
            input_states[key] = state
            changed = True
            edges.append((di, prev, state))
            log("DI{} {}".format(di, state.upper()))
    return changed, edges


def handle_security_di_edges(edges):
    """DI1/DI2 立上りを豊島邸コントローラへ渡す。"""
    global _security, _pending_events
    if _security is None:
        return
    building = _building()
    for di, prev, new in edges:
        if di not in (1, 2):
            continue
        if new != "on":
            if _security is not None:
                try:
                    _security.clear_event_ack(di)
                except Exception:
                    pass
            _pending_events = [
                ev
                for ev in _pending_events
                if not (
                    ev.get("building") == building and ev.get("di") == di
                )
            ]
        _security.on_di_edge(di, prev, new)


def _event_key(building, di):
    return "{}:{}".format(building, di)


def _forward_event(building, di, message):
    """DI 検知を即キューし、HB を待たず POST する。
    送信成功後は物理OFFまで同じ DI を再送しない。
    """
    global _pending_events
    try:
        if _security is not None and getattr(_security, "_event_acked", {}).get(di):
            log("event skip acked DI{}".format(di))
            return True
        for ev in _pending_events:
            if ev.get("building") == building and ev.get("di") == di:
                log("event already queued DI{}".format(di))
                _flush_pending_events()
                return False
        _pending_events.append(
            {
                "building": building,
                "di": di,
                "message": message,
            }
        )
        log("event queued: {}".format(message))
        _flush_pending_events()
        if _security is not None and getattr(_security, "_event_acked", {}).get(di):
            return True
        return False
    except Exception as exc:
        try:
            log_error("event forward: {}".format(exc))
        except Exception:
            pass
        return False


def _flush_pending_events():
    """キュー済み /event を即時送信する。成功分は必ず捨てる。"""
    global _pending_events
    if not _pending_events:
        return
    remain = []
    for ev in _pending_events:
        try:
            kick_watchdog(_wdt)
            ok = send_toyoshima_event(
                http_post,
                ev.get("building"),
                ev.get("di"),
                ev.get("message"),
                site_id=_site_id(),
                device_id=_device_id(),
            )
            if ok:
                log("event sent: {}".format(ev.get("message")))
                di = ev.get("di")
                if _security is not None and di is not None:
                    try:
                        _security.mark_event_acked(di)
                    except Exception:
                        pass
            else:
                remain.append(ev)
                log_error("event send failed: {}".format(ev.get("message")))
        except Exception as exc:
            remain.append(ev)
            log_error("event send exception: {}".format(exc))
    _pending_events = remain


async def _flush_pending_events_async():
    """create_task 用。HB 周期とは独立して再送する。"""
    try:
        _flush_pending_events()
    except Exception as exc:
        try:
            log_error("event flush async: {}".format(exc))
        except Exception:
            pass


async def event_retry_loop():
    """失敗した /event を 200ms 周期で再送する。5分 HB は使わない。"""
    while True:
        try:
            _flush_pending_events()
        except Exception as exc:
            log_error("event retry: {}".format(exc))
        await asyncio.sleep_ms(EVENT_RETRY_MS)


def send_heartbeat():
    """起動直後＆5分周期 — 豊島邸 heartbeat API。"""
    global _last_hb_ok
    try:
        building = _building()
        extra = {
            "firmware": getattr(
                config, "FIRMWARE_VERSION", FIRMWARE_LOGIC_VERSION
            ),
            "firmware_version": FIRMWARE_LOGIC_VERSION,
            "otaVersion": FIRMWARE_LOGIC_VERSION,
            "chStates": dict(ch_states),
            "inputStates": dict(input_states),
            "tenantId": getattr(config, "TENANT_ID", TENANT_ID),
            "uptime_sec": _uptime_sec(),
            "ip": get_ip(),
        }
        if _kit:
            extra.update(_kit.payload_fields())
        payload = build_heartbeat_payload(
            building,
            site_id=_site_id(),
            device_id=_device_id(),
            extra=extra,
        )
        temp = payload.get("board_temp")
        if temp is not None:
            log("board_temp={:.1f}C".format(temp))
            if payload.get("overheat"):
                log("過熱フラグ — {}C超".format(BOARD_TEMP_OVERHEAT_C))
        log("heartbeat payload keys={}".format(list(payload.keys())))
        body, status = http_post(
            "/api/home/v1/toyoshima/heartbeat", payload
        )
        if status != 200:
            _last_hb_ok = False
            if _kit:
                _kit.note_heartbeat(False)
            else:
                set_rgb_status("error")
            log_error(
                "heartbeat HTTP {} — {}".format(
                    status, (body or "")[:120]
                )
            )
            return False
        _last_hb_ok = True
        if _kit:
            _kit.note_heartbeat(True)
        else:
            set_rgb_status("ok")
        log("heartbeat sent ({}) ONLINE".format(building))
        _stash_hb_command(body)
        if mark_boot_ok:
            try:
                mark_boot_ok(config)
            except Exception:
                pass
        if has_ota_update_from_body and ota_maybe_update:
            try:
                if has_ota_update_from_body(body):
                    ota_maybe_update(
                        http_get,
                        config=config,
                        kick_wdt=lambda: kick_watchdog(_wdt),
                    )
            except Exception as ota_exc:
                log_error("OTA from HB: {}".format(ota_exc))
        return True
    except Exception as e:
        _last_hb_ok = False
        if _kit:
            _kit.note_heartbeat(False)
        else:
            set_rgb_status("error")
        log_error("heartbeat exception: {}".format(e))
        return False


def ensure_network_or_retry():
    """不通時は赤表示→再初期化。"""
    ip = get_ip()
    if ip:
        return ip
    set_rgb_status("error")
    log_error("ネットワーク不通 — 再接続を試行")
    kick_watchdog(_wdt)
    ifconfig = init_ethernet()
    ip = get_ip()
    if ip:
        log("再接続成功 IP={}".format(ip))
        if ifconfig:
            log(
                "  netmask: {}  gw: {}".format(
                    ifconfig[1], ifconfig[2]
                )
            )
        return ip
    set_rgb_status("error")
    return None


def poll_security_rules():
    """VPS から最新防犯ルール JSON を取得。"""
    global _security
    if _security is None:
        return
    site_id = getattr(
        config, "SECURITY_RULES_SITE_ID", "HOME-JP-TOYOSHIMA"
    )
    path = (
        "/api/home/v1/security-rules/firmware?siteId=" + site_id
    )
    body, status = http_get(path)
    if status != 200:
        return
    try:
        data = json.loads(body)
        rules = data.get("rules")
        if rules:
            _security.apply_rules(rules)
            log("security rules applied")
    except Exception as e:
        log_error("rules parse: {}".format(e))


def poll_command():
    """豊島専用キューを長待ち取得する。
    板橋 remote-test とは分離する。
    """
    device_id = _device_id()
    path = (
        "/api/home/v1/toyoshima/command?deviceId="
        + device_id
        + "&waitMs="
        + str(COMMAND_WAIT_MS)
    )
    body, status = http_get(path)
    if status == 403:
        log_error("AUTH 403 — REMOTE_TEST_TOKEN を確認")
        return None
    if status != 200 or not body:
        return None
    try:
        data = json.loads(body)
        if not isinstance(data, dict):
            return None
        return _extract_command_payload(data)
    except Exception:
        return None


def _extract_command_payload(data):
    """応答 JSON から手動命令だけ取り出す。"""
    if not isinstance(data, dict):
        return None
    cmd = str(data.get("command") or data.get("cmd") or "").strip()
    if not cmd:
        return None
    return data


def _stash_hb_command(body):
    """heartbeat 同梱の命令を次ループで実行する。"""
    global _pending_hb_cmd
    try:
        data = json.loads(body) if body else None
        payload = _extract_command_payload(data)
        if payload:
            _pending_hb_cmd = payload
            log("HB piggyback cmd={}".format(payload.get("command")))
    except Exception:
        pass


def _take_pending_hb_command():
    global _pending_hb_cmd
    payload = _pending_hb_cmd
    _pending_hb_cmd = None
    return payload


async def apply_manual_payload(payload):
    """昼夜を無視して対象 DO を即時 ON する。"""
    if not payload:
        return
    cmd = str(payload.get("command") or payload.get("cmd") or "").strip()
    if not cmd:
        return
    try:
        duration_ms = int(payload.get("durationMs") or 0)
    except Exception:
        duration_ms = 0
    off = cmd in ("bulk_off", "light_all_off") or str(cmd).endswith("_off")
    raw_ch = payload.get("channels") or []
    forced = []
    if isinstance(raw_ch, list):
        for item in raw_ch:
            try:
                ch = int(item)
            except Exception:
                continue
            if ch < 1 or ch > 8:
                continue
            set_ch_output(ch, not off)
            forced.append(ch)
    if not forced:
        for ch in _channels_for_manual_cmd(cmd):
            set_ch_output(ch, not off)
            forced.append(ch)
    log(
        "immediate relay cmd={} ch={} bypass=1".format(
            cmd, forced or "-"
        )
    )
    handled = False
    if _security:
        try:
            handled = await _security.execute_manual_command(
                cmd, duration_ms
            )
        except Exception as cmd_exc:
            log_error("manual: {}".format(cmd_exc))
            handled = False
    if not handled:
        await exec_manual_do(cmd, duration_ms)


async def exec_manual_do(cmd, duration_ms=0):
    """コントローラ未初期化時の GPIO 直叩き。"""
    mapping = {
        "do1_on": (1, True),
        "do1_off": (1, False),
        "do2_on": (2, True),
        "do2_off": (2, False),
        "do3_on": (3, True),
        "do3_off": (3, False),
        "ch1_on": (1, True),
        "ch1_off": (1, False),
        "ch2_on": (2, True),
        "ch2_off": (2, False),
        "ch3_on": (3, True),
        "ch3_off": (3, False),
        "light1_on": (1, True),
        "light1_off": (1, False),
        "light2_on": (2, True),
        "light2_off": (2, False),
    }
    if cmd in mapping:
        ch, on = mapping[cmd]
        set_ch_output(ch, on)
        log("EXEC {} -> CH{} {}".format(cmd, ch, "ON" if on else "OFF"))
        if on and duration_ms > 0:
            await asyncio.sleep_ms(int(duration_ms))
            set_ch_output(ch, False)
        return True
    if cmd in ("bulk_on", "light_all_on"):
        if _building() == "detached":
            set_ch_output(1, True)
            log("EXEC bulk_on detached CH1")
        else:
            set_ch_output(1, True)
            set_ch_output(2, True)
            set_ch_output(3, True)
            log("EXEC bulk_on CH1+CH2+CH3")
        if duration_ms > 0:
            await asyncio.sleep_ms(int(duration_ms))
            set_ch_output(1, False)
            if _building() != "detached":
                set_ch_output(2, False)
                set_ch_output(3, False)
        return True
    if cmd in ("bulk_off", "light_all_off"):
        set_ch_output(1, False)
        set_ch_output(2, False)
        if _building() != "detached":
            set_ch_output(3, False)
        log("EXEC bulk_off CH1+CH2+CH3")
        return True
    if cmd in ("sensor_far", "di1_alarm"):
        set_ch_output(1, True)
        log("EXEC {} CH1".format(cmd))
        return True
    if cmd in ("sensor_near", "di2_alarm"):
        set_ch_output(1, True)
        set_ch_output(2, True)
        set_ch_output(3, True)
        log("EXEC {} CH1+CH2+CH3".format(cmd))
        return True
    if cmd in ("flash_test", "patlite_test"):
        ch = 2 if _building() == "detached" else 3
        ms = duration_ms if duration_ms > 0 else 15000
        set_ch_output(ch, True)
        log("EXEC {} CH{} {}ms".format(cmd, ch, ms))
        await asyncio.sleep_ms(int(ms))
        set_ch_output(ch, False)
        return True
    return False


def _ensure_rgb_direct():
    """セーフモード用に neopixel を直接確保する。"""
    global _rgb
    if _rgb is not None:
        return
    try:
        import neopixel

        _rgb = neopixel.NeoPixel(
            Pin(int(getattr(config, "RGB_LED_PIN", 2))),
            int(getattr(config, "RGB_LED_COUNT", 1)),
        )
    except Exception:
        _rgb = None


def _safe_mode_heartbeat(reason):
    """セーフモードを VPS へ知らせる（失敗は無視）。"""
    try:
        payload = build_heartbeat_payload(
            _building(),
            site_id=_site_id(),
            device_id=_device_id(),
            extra={
                "firmware": getattr(config, "FIRMWARE_VERSION", "safe-mode"),
                "firmware_version": FIRMWARE_LOGIC_VERSION,
                "safe_mode": True,
                "safe_mode_reason": str(reason)[:180],
                "uptime_sec": _uptime_sec(),
                "ip": get_ip(),
            },
        )
        _body, status = http_post(
            "/api/home/v1/toyoshima/heartbeat", payload
        )
        return status == 200, _body
    except Exception as exc:
        log_error("safe heartbeat: {}".format(exc))
        return False, None


def _safe_mode_loop(reason):
    """
    赤ランプで固まらせず OTA 待機へ退避する最終防衛線。
    LAN と WDT を維持し、修正版ファームを遠隔で受け取る。
    """
    global SAFE_MODE, SAFE_MODE_REASON, _wdt
    SAFE_MODE = True
    SAFE_MODE_REASON = str(reason)
    log_error("セーフモード移行: {}".format(SAFE_MODE_REASON))
    log("LAN と OTA 待機のみ継続する（橙点滅）")

    if _wdt is None:
        try:
            _wdt = init_watchdog(
                int(getattr(config, "WDT_TIMEOUT_MS", WDT_TIMEOUT_MS))
            )
        except Exception as exc:
            log_error("safe WDT: {}".format(exc))
    _ensure_rgb_direct()

    try:
        for ch in list(CH_PINS.keys()):
            try:
                CH_PINS[ch].value(_relay_gpio_level(ch, False))
            except Exception:
                pass
    except Exception:
        pass

    cycle = 0
    while True:
        kick_watchdog(_wdt)
        set_rgb_status("safe")
        try:
            if not get_ip():
                init_ethernet()
        except Exception as exc:
            log_error("safe LAN: {}".format(exc))
        if get_ip():
            ok, body = _safe_mode_heartbeat(SAFE_MODE_REASON)
            if ota_maybe_update:
                try:
                    ota_maybe_update(
                        http_get,
                        config=config,
                        kick_wdt=lambda: kick_watchdog(_wdt),
                        force=True,
                    )
                except Exception as exc:
                    log_error("safe OTA: {}".format(exc))
            log("safe cycle {} hb={}".format(cycle, "ok" if ok else "ng"))
        cycle += 1
        for _i in range(30):
            kick_watchdog(_wdt)
            time.sleep_ms(1000)


async def async_main():
    global _security, _wdt

    building = _building()
    label = (
        "母屋（主装置・8回路）"
        if building == "main"
        else "はなれ（子機・6回路）"
    )
    log("豊島邸 {} 起動".format(label))
    log(
        "TENANT={} SITE={} DEVICE={}".format(
            getattr(config, "TENANT_ID", TENANT_ID),
            _site_id(),
            _device_id(),
        )
    )
    log(
        "fw={} logic={} debounce={}ms waitMs={}".format(
            getattr(config, "FIRMWARE_VERSION", "?"),
            FIRMWARE_LOGIC_VERSION,
            getattr(config, "DI_DEBOUNCE_MS", DI_DEBOUNCE_MS),
            COMMAND_WAIT_MS,
        )
    )

    log(
        "relay pinmap CH1=GPIO{} CH2=GPIO{} CH3=GPIO{}".format(
            CH_GPIO_MAP.get(1), CH_GPIO_MAP.get(2), CH_GPIO_MAP.get(3)
        )
    )

    init_rgb_led()
    set_rgb_status("boot")

    wdt_ms = int(getattr(config, "WDT_TIMEOUT_MS", WDT_TIMEOUT_MS))
    _wdt = init_watchdog(wdt_ms)
    kick_watchdog(_wdt)

    for ch in sorted(CH_PINS.keys()):
        CH_PINS[ch].value(_relay_gpio_level(ch, False))
        ch_states[str(ch)] = "off"

    for di in sorted(DI_PINS.keys()):
        input_states[str(di)] = read_di_state(di)

    ifconfig = init_ethernet()
    kick_watchdog(_wdt)
    if _kit:
        try:
            _kit.http_get = http_get
            _kit.kick_wdt = lambda: kick_watchdog(_wdt)
            _kit.run_lan(bool(get_ip()))
            if get_ip():
                _kit.run_ota()
        except Exception as kit_exc:
            log_error("kitting lan: {}".format(kit_exc))
    if ota_maybe_update and get_ip():
        try:
            ota_maybe_update(
                http_get,
                config=config,
                kick_wdt=lambda: kick_watchdog(_wdt),
            )
        except Exception as ota_exc:
            log_error("boot OTA: {}".format(ota_exc))
    ip = get_ip()
    if ip:
        log("IP address: {}".format(ip))
        if ifconfig:
            log(
                "  netmask: {}  gw: {}".format(
                    ifconfig[1], ifconfig[2]
                )
            )
    else:
        if not _kit:
            set_rgb_status("error")
        log_error("Ethernet 未接続 — PoE/LAN・DHCP/固定IPを確認")

    try:
        if building == "detached":
            _security = ToyoshimaDetachedController(
                set_ch_output, _forward_event
            )
            log("はなれ 道路側/通路側センサー制御を有効化")
        else:
            _security = ToyoshimaMainHouseController(
                set_ch_output, _forward_event
            )
            log("母屋 遠近ビームセンサー制御を有効化")
        _security.set_di_reader(read_di_state)
    except Exception as ctrl_exc:
        _security = None
        log_error("センサー制御初期化: {}".format(ctrl_exc))
        _safe_mode_loop("controller: {}".format(ctrl_exc))
        return

    try:
        poll_security_rules()
    except Exception as rules_exc:
        log_error("初回 rules 同期: {}".format(rules_exc))

    poll_interval_sec = int(config.POLL_INTERVAL_SEC)
    heartbeat_interval_sec = int(
        getattr(
            config, "HEARTBEAT_INTERVAL_SEC", HEARTBEAT_INTERVAL_SEC
        )
    )
    if heartbeat_interval_sec < poll_interval_sec:
        heartbeat_interval_sec = poll_interval_sec
    heartbeat_interval_ms = heartbeat_interval_sec * 1000
    rules_sync_every = int(
        getattr(config, "SECURITY_RULES_SYNC_EVERY", 10)
    )
    poll_counter = 0

    # 起動直後に 1 発目 heartbeat を即時送信（0 秒・待機ループ前）
    kick_watchdog(_wdt)
    log("boot heartbeat (0 sec) — before poll loop")
    if get_ip():
        try:
            send_heartbeat()
        except Exception as e:
            log_error("boot heartbeat exception: {}".format(e))
    else:
        if not _kit:
            set_rgb_status("error")

    log(
        "polling start (poll {} sec / heartbeat {} sec)".format(
            poll_interval_sec, heartbeat_interval_sec
        )
    )
    next_heartbeat_ms = time.ticks_add(
        time.ticks_ms(), heartbeat_interval_ms
    )
    net_retry_every = 20
    net_retry_counter = 0

    try:
        asyncio.create_task(event_retry_loop())
        log("event retry loop start ({} ms)".format(EVENT_RETRY_MS))
    except Exception as ev_exc:
        log_error("event retry start: {}".format(ev_exc))

    while True:
        kick_watchdog(_wdt)

        # DI を HTTP より先に読む。GPIO キックは同期。
        try:
            changed, edges = poll_inputs()
            if edges:
                handle_security_di_edges(edges)
                # create_task した /event を HB より先に走らせる
                await asyncio.sleep_ms(0)
        except Exception as di_exc:
            log_error("DI 処理: {}".format(di_exc))

        try:
            if _pending_events:
                _flush_pending_events()
                asyncio.create_task(_flush_pending_events_async())
        except Exception as flush_exc:
            log_error("event flush: {}".format(flush_exc))
            _flush_pending_events()

        net_retry_counter += 1
        if net_retry_counter >= net_retry_every:
            net_retry_counter = 0
            if not get_ip():
                ensure_network_or_retry()

        poll_counter += 1
        if poll_counter >= rules_sync_every:
            poll_counter = 0
            try:
                poll_security_rules()
            except Exception as rules_exc:
                log_error("rules 同期: {}".format(rules_exc))

        try:
            payload = poll_command()
            if not payload:
                payload = _take_pending_hb_command()
            if payload:
                await apply_manual_payload(payload)
        except Exception as cmd_exc:
            log_error("命令処理: {}".format(cmd_exc))

        now = time.ticks_ms()
        if time.ticks_diff(now, next_heartbeat_ms) >= 0:
            if not get_ip():
                ensure_network_or_retry()
            # 失敗時は 10 秒×最大 3 回。
            # 全滅しても次の 5 分周期まで待つ。
            try:
                _flush_pending_events()
                send_heartbeat_with_retry(
                    send_heartbeat,
                    kick_wdt=lambda: kick_watchdog(_wdt),
                )
            except Exception as e:
                log_error("heartbeat exception: {}".format(e))
            if not _last_hb_ok:
                if _kit:
                    _kit.note_heartbeat(False)
                else:
                    set_rgb_status("error")
            next_heartbeat_ms = time.ticks_add(
                now, heartbeat_interval_ms
            )
        if _kit:
            _kit.tick()
        elif _last_hb_ok:
            set_rgb_status("ok")

        await asyncio.sleep_ms(LOOP_IDLE_MS)


def run():
    """どんな例外でも赤固定にせずセーフモードへ退避する。"""
    if SAFE_MODE or ToyoshimaMainHouseController is None:
        _safe_mode_loop(SAFE_MODE_REASON or "起動時ガード")
        return
    try:
        asyncio.run(async_main())
    except Exception as exc:
        log_error("main 異常終了: {}".format(exc))
        _safe_mode_loop("main: {}".format(exc))


# 実機は main.py として直接実行される（import 形態でも起動する）
if __name__ in ("__main__", "main"):
    run()

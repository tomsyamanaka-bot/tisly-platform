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

import config
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

try:
    import urequests
except ImportError:
    urequests = None

try:
    from tisly_ota import has_ota_update_from_body
    from tisly_ota import local_version as ota_local_version
    from tisly_ota import mark_boot_ok
    from tisly_ota import maybe_update as ota_maybe_update
except ImportError:
    try:
        from lib.tisly_ota import has_ota_update_from_body
        from lib.tisly_ota import local_version as ota_local_version
        from lib.tisly_ota import mark_boot_ok
        from lib.tisly_ota import maybe_update as ota_maybe_update
    except ImportError:
        has_ota_update_from_body = None
        ota_local_version = None
        mark_boot_ok = None
        ota_maybe_update = None

try:
    from tisly_self_test import get_runner as get_kitting_runner
except ImportError:
    get_kitting_runner = None

# --- W5500 SPI ピン（Waveshare 準拠） ---
W5500_SPI_ID = 0
W5500_SCK = 34
W5500_MOSI = 35
W5500_MISO = 36
W5500_CS = 33
W5500_RST = 25


def _relay_gpio_level(channel, on):
    """論理ONをGPIOレベルへ変換する。
    Waveshare 8RO は HIGH=コイルON。
    """
    invert = False
    invert_map = getattr(config, "CH_INVERT", None)
    if invert_map:
        invert = bool(invert_map.get(channel, False))
    if bool(getattr(config, "RO_ACTIVE_LOW", False)):
        invert = not invert
    if invert:
        return 0 if on else 1
    return 1 if on else 0


CH_PINS = {}
for ch, gpio in config.CH_GPIO.items():
    pin = Pin(gpio, Pin.OUT)
    pin.value(_relay_gpio_level(ch, False))
    CH_PINS[ch] = pin

DI_PINS = {}
_di_active_low = bool(getattr(config, "DI_ACTIVE_LOW", True))
_di_pull = Pin.PULL_UP if _di_active_low else Pin.PULL_DOWN
for di, gpio in config.DI_GPIO.items():
    DI_PINS[di] = Pin(gpio, Pin.IN, _di_pull)

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
# DI サンプリングを HTTP 長待ちで潰さない。
# 命令は 0ms GET + 50ms idle で即時取得する。
COMMAND_WAIT_MS = 0
LOOP_IDLE_MS = 50


def log(msg):
    print("[豊島邸]", msg)


def log_error(msg):
    print("[豊島邸] error:", msg)


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
    if _kit:
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


def http_post(path, payload):
    if urequests is None:
        log_error("urequests 未インストール")
        return None, 0
    url = config.API_BASE.rstrip("/") + path
    try:
        body = json.dumps(payload)
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
    """
    if channel not in CH_PINS:
        return
    gpio = config.CH_GPIO.get(channel)
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
    global _security
    if _security is None:
        return
    for di, prev, new in edges:
        if di in (1, 2):
            _security.on_di_edge(di, prev, new)


def _forward_event(building, di, message):
    ok = send_toyoshima_event(
        http_post,
        building,
        di,
        message,
        site_id=_site_id(),
        device_id=_device_id(),
    )
    if ok:
        log("event sent: {}".format(message))
    else:
        log_error("event send failed: {}".format(message))


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
    poll_security_rules()

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

    while True:
        kick_watchdog(_wdt)

        # DI を HTTP より先に読む。GPIO キックは同期。
        changed, edges = poll_inputs()
        if edges:
            handle_security_di_edges(edges)

        net_retry_counter += 1
        if net_retry_counter >= net_retry_every:
            net_retry_counter = 0
            if not get_ip():
                ensure_network_or_retry()

        poll_counter += 1
        if poll_counter >= rules_sync_every:
            poll_counter = 0
            poll_security_rules()

        payload = poll_command()
        if not payload:
            payload = _take_pending_hb_command()
        if payload:
            await apply_manual_payload(payload)

        now = time.ticks_ms()
        if time.ticks_diff(now, next_heartbeat_ms) >= 0:
            if not get_ip():
                ensure_network_or_retry()
            # 失敗時は 10 秒×最大 3 回。
            # 全滅しても次の 5 分周期まで待つ。
            try:
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
    asyncio.run(async_main())


run()

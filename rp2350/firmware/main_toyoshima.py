"""
豊島邸 RP2350 ファームウェア — 実機 main.py 用

Waveshare RP2350-POE-ETH-8DI-8RO / MicroPython
母屋（主装置 8ch）・はなれ（子機 6ch）を BUILDING で切替。

機能:
- DI 100ms デバウンス + ライト / パトライト連動
- 5 分 heartbeat（board_temp / 過熱フラグ）
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
    send_toyoshima_event,
    send_toyoshima_heartbeat,
)

try:
    import urequests
except ImportError:
    urequests = None

# --- W5500 SPI ピン（Waveshare 準拠） ---
W5500_SPI_ID = 0
W5500_SCK = 34
W5500_MOSI = 35
W5500_MISO = 36
W5500_CS = 33
W5500_RST = 25

CH_PINS = {}
for ch, gpio in config.CH_GPIO.items():
    pin = Pin(gpio, Pin.OUT)
    pin.value(0)
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
    """オンボード WS2812 自己診断 LED を初期化。"""
    global _rgb
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
    青=接続中 / 緑点滅=HB正常 /
    赤=不通またはAPIエラー
    """
    global _rgb_blink_on
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
    """リレー出力と ch_states を同期更新。"""
    if channel not in CH_PINS:
        return
    CH_PINS[channel].value(1 if on else 0)
    ch_states[str(channel)] = "on" if on else "off"


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
    building = _building()
    payload = build_heartbeat_payload(
        building,
        site_id=_site_id(),
        device_id=_device_id(),
        extra={
            "firmware": getattr(
                config, "FIRMWARE_VERSION", "toyoshima"
            ),
            "chStates": dict(ch_states),
            "inputStates": dict(input_states),
            "tenantId": getattr(config, "TENANT_ID", TENANT_ID),
            "uptime_sec": _uptime_sec(),
            "ip": get_ip(),
        },
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
        set_rgb_status("error")
        log_error(
            "heartbeat HTTP {} — {}".format(
                status, (body or "")[:120]
            )
        )
        return False
    _last_hb_ok = True
    set_rgb_status("ok")
    log("heartbeat sent ({}) ONLINE".format(building))
    return True


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
    """PWA 手動命令（任意・トークン必須）。"""
    path = "/api/remote-test/command"
    body, status = http_get(path)
    if status != 200 or not body:
        return None
    try:
        data = json.loads(body)
        return data.get("command") or data.get("cmd")
    except Exception:
        return None


async def exec_manual_do(cmd):
    """簡易手動 DO（do1_on 等）。"""
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
    }
    if cmd in mapping:
        ch, on = mapping[cmd]
        set_ch_output(ch, on)
        log("EXEC {} -> CH{} {}".format(cmd, ch, "ON" if on else "OFF"))
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
        "fw={} debounce={}ms".format(
            getattr(config, "FIRMWARE_VERSION", "?"),
            getattr(config, "DI_DEBOUNCE_MS", DI_DEBOUNCE_MS),
        )
    )

    init_rgb_led()
    set_rgb_status("boot")

    wdt_ms = int(getattr(config, "WDT_TIMEOUT_MS", WDT_TIMEOUT_MS))
    _wdt = init_watchdog(wdt_ms)
    kick_watchdog(_wdt)

    for ch in sorted(CH_PINS.keys()):
        CH_PINS[ch].value(0)
        ch_states[str(ch)] = "off"

    for di in sorted(DI_PINS.keys()):
        input_states[str(di)] = read_di_state(di)

    ifconfig = init_ethernet()
    kick_watchdog(_wdt)
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

    # 起動直後に 1 発目 heartbeat を即時送信
    kick_watchdog(_wdt)
    if get_ip():
        send_heartbeat()
    else:
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

        net_retry_counter += 1
        if net_retry_counter >= net_retry_every:
            net_retry_counter = 0
            if not get_ip():
                ensure_network_or_retry()

        poll_counter += 1
        if poll_counter >= rules_sync_every:
            poll_counter = 0
            poll_security_rules()

        cmd = poll_command()
        if cmd:
            await exec_manual_do(str(cmd).strip())

        changed, edges = poll_inputs()
        if edges:
            handle_security_di_edges(edges)

        now = time.ticks_ms()
        if time.ticks_diff(now, next_heartbeat_ms) >= 0:
            if not get_ip():
                ensure_network_or_retry()
            if send_heartbeat():
                next_heartbeat_ms = time.ticks_add(
                    now, heartbeat_interval_ms
                )
            else:
                # 失敗時は数秒後に自動再試行
                set_rgb_status("error")
                next_heartbeat_ms = time.ticks_add(now, 5_000)
        elif _last_hb_ok:
            set_rgb_status("ok")

        await asyncio.sleep(poll_interval_sec)


def run():
    asyncio.run(async_main())


run()

"""

TiSLY Remote Test — 最小ファームウェア



Waveshare RP2350-POE-ETH-8DI-8RO / MicroPython v1.28.0

PoE 起動 → Ethernet 初期化 → 3 秒ごとに命令取得・DI読取 / 300 秒ごとに heartbeat → CH1〜CH8 ON/OFF 実行

※ 豊島邸本番書き込みは main_toyoshima.py を
  tools/flash_rp2350.py が main.py として転送する。

"""



import json

import time

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

from machine import Pin

import config
from security_light import SecurityLightController

# VPS 手動防犯ライト命令（security_light.py と同期）
SECURITY_LIGHT_COMMANDS = (
    "light_24v_on",
    "light_24v_off",
    "light_24v_strobe",
    "light_100v_on",
    "light_100v_off",
    "light_all_on",
    "light_all_off",
)



try:

    import urequests

except ImportError:

    urequests = None



# --- W5500 SPI ピン（Waveshare 02_MQTT サンプル準拠・要 lib/） ---

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



ch_states = {

    "1": "off",

    "2": "off",

    "3": "off",

    "4": "off",

    "5": "off",

    "6": "off",

    "7": "off",

    "8": "off",

}



input_states = {

    "1": "off",

    "2": "off",

    "3": "off",

    "4": "off",

    "5": "off",

    "6": "off",

    "7": "off",

    "8": "off",

}



_lan = None

_security = None


def log(msg):

    print("[tisly]", msg)





def log_error(msg):

    print("[tisly] error:", msg)





def _wait_lan(lan, timeout_sec=15):

    deadline = time.ticks_add(time.ticks_ms(), int(timeout_sec * 1000))

    while time.ticks_diff(deadline, time.ticks_ms()) > 0:

        if lan.isconnected():

            return True

        time.sleep_ms(200)

    return lan.isconnected()





def init_ethernet():

    """W5500 / network.LAN / WIZNET5K の順で Ethernet を初期化。"""

    global _lan



    log("Ethernet init")



    # 1) Waveshare 同梱 MicroPython の network.LAN()（推奨）

    try:

        import network



        if hasattr(network, "LAN"):

            lan = network.LAN()

            if not lan.isconnected():

                lan.active(True)

                _wait_lan(lan)

            if lan.isconnected():

                _lan = lan

                return lan.ifconfig()

    except Exception as e:

        log_error("network.LAN: {}".format(e))



    # 2) MicroPython network.WIZNET5K + W5500 SPI

    try:

        import network

        from machine import SPI



        if hasattr(network, "WIZNET5K"):

            spi = SPI(

                W5500_SPI_ID,

                baudrate=20_000_000,

                polarity=0,

                phase=0,

                sck=Pin(W5500_SCK),

                mosi=Pin(W5500_MOSI),

                miso=Pin(W5500_MISO),

            )

            nic = network.WIZNET5K(spi, Pin(W5500_CS), Pin(W5500_RST))

            nic.active(True)

            try:

                nic.ifconfig("dhcp")

            except TypeError:

                nic.ifconfig(["0.0.0.0", "255.255.255.0", "0.0.0.0", "8.8.8.8"])

            _wait_lan(nic)

            if nic.isconnected():

                _lan = nic

                return nic.ifconfig()

    except Exception as e:

        log_error("network.WIZNET5K: {}".format(e))



    # 3) Waveshare lib/ の ethernet_init（02_MQTT サンプル）

    try:

        from ethernet_init import ethernet_init  # noqa: F401 — lib/ 内モジュール



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

    headers = {"X-Remote-Test-Token": config.REMOTE_TEST_TOKEN}

    if content_type:

        headers["Content-Type"] = content_type

    return headers



def http_get(path):

    if urequests is None:

        log_error("urequests 未インストール — Thonny ツール → パッケージ → urequests")

        return None, 0



    url = config.API_BASE.rstrip("/") + path

    try:

        res = urequests.get(url, headers=_http_headers())

        status = res.status_code

        body = res.text

        res.close()

        return body, status

    except OSError as e:

        log_error("HTTP: {}".format(e))

        return None, 0

    except Exception as e:

        log_error("HTTP: {}".format(e))

        return None, 0





def http_post(path, payload):

    if urequests is None:

        log_error("urequests 未インストール — Thonny ツール → パッケージ → urequests")

        return None, 0



    url = config.API_BASE.rstrip("/") + path

    try:

        body = json.dumps(payload)

        res = urequests.post(url, headers=_http_headers("application/json"), data=body)

        status = res.status_code

        text = res.text

        res.close()

        return text, status

    except OSError as e:

        log_error("HTTP POST: {}".format(e))

        return None, 0

    except Exception as e:

        log_error("HTTP POST: {}".format(e))

        return None, 0





def read_di_state(di):

    raw = DI_PINS[di].value()

    if _di_active_low:

        return "on" if raw == 0 else "off"

    return "on" if raw == 1 else "off"





def poll_inputs():

    """DI1〜DI8をデバウンスして更新（既定 50ms・確定は security_light 側）。"""

    changed = False

    edges = []

    debounce_ms = int(getattr(config, "DI_DEBOUNCE_MS", 50))

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


def set_ch_output(channel, on):

    """リレー出力と ch_states を同期更新。"""

    if channel not in CH_PINS:

        return

    CH_PINS[channel].value(1 if on else 0)

    ch_states[str(channel)] = "on" if on else "off"


def handle_security_di_edges(edges):

    """DI1/DI2 立上り — security_light 側で 50ms 継続 ON 確定。"""

    global _security

    if _security is None:

        return

    for di, prev, new in edges:

        if di in (1, 2):

            _security.on_di_edge(di, prev, new)





def send_heartbeat():

    path = "/api/remote-test/heartbeat"

    payload = {

        "firmware": config.FIRMWARE_VERSION,

        "chStates": dict(ch_states),

        "inputStates": dict(input_states),

    }

    try:
        from toyoshima_security import read_board_temperature_c
        temp = read_board_temperature_c()
        if temp is not None:
            payload["board_temp"] = temp
    except ImportError:
        pass
    except Exception:
        pass

    log("heartbeat payload={}".format(json.dumps(payload)))

    body, status = http_post(path, payload)



    if status == 403:

        log_error("AUTH 403 — config.REMOTE_TEST_TOKEN を VPS .env と一致させてください")

        return False

    if status != 200:

        log_error("heartbeat HTTP {} — {}".format(status, (body or "")[:120]))

        return False



    log("heartbeat status={}".format(status))

    log("heartbeat sent")

    mapping_device_id = getattr(

        config, "PORT_MAPPING_DEVICE_ID", "TISLY-BOX-001"

    )

    if mapping_device_id:

        mapping_payload = {

            "deviceId": mapping_device_id,

            "relayStates": dict(ch_states),

            "inputStates": dict(input_states),

            "debounceMs": int(

                getattr(config, "DI_DEBOUNCE_MS", 50)

            ),

        }

        _, mapping_status = http_post(

            "/api/device/ports/telemetry", mapping_payload

        )

        if mapping_status != 200:

            log_error(

                "port telemetry HTTP {}".format(mapping_status)

            )

    return True





def poll_security_rules():
    """VPS から最新防犯ルール JSON を取得。"""
    global _security
    if _security is None:
        return
    site_id = getattr(config, "SITE_ID", "HOME-JP-ITABASHI-LIVE")
    path = (
        "/api/home/v1/security-rules/firmware?siteId="
        + site_id
    )
    body, status = http_get(path)
    if status != 200:
        if status == 403:
            log_error(
                "security rules AUTH 403 — token mismatch"
            )
        return
    try:
        data = json.loads(body)
        rules = data.get("rules")
        if rules:
            _security.apply_rules(rules)
    except Exception as e:
        log_error("security rules parse: {}".format(e))


def poll_command():

    path = "/api/remote-test/command"

    body, status = http_get(path)



    if status == 403:

        log_error("AUTH 403 — config.REMOTE_TEST_TOKEN を VPS .env と一致させてください")

        return None

    if status != 200:

        log_error("poll HTTP {} — {}".format(status, (body or "")[:120]))

        return None



    try:

        data = json.loads(body)

    except Exception as e:

        log_error("JSON parse: {} — {}".format(e, (body or "")[:120]))

        return None



    return data.get("command")





def poll_port_mapping_command():

    """現場テスト用RO命令を取得する。"""

    mapping_device_id = getattr(

        config, "PORT_MAPPING_DEVICE_ID", "TISLY-BOX-001"

    )

    if not mapping_device_id:

        return None

    path = (

        "/api/device/ports/command?deviceId="

        + mapping_device_id

    )

    body, status = http_get(path)

    if status != 200:

        return None

    try:

        data = json.loads(body)

        command = data.get("command")

        if not command:

            return None

        channel = int(command.get("portNumber"))

        suffix = "on" if command.get("on") else "off"

        return "ch{}_{}".format(channel, suffix)

    except Exception as e:

        log_error("port command parse: {}".format(e))

        return None


def _parse_channel_command(cmd):

    """ch{N}_on / ch{N}_off / ch{N}_pulse_{ms} を分解。

    戻り値: (channel, on, pulse_ms|None) または None。
    """

    if not cmd or not cmd.startswith("ch"):

        return None



    rest = cmd[2:]

    pulse_ms = None

    if "_pulse_" in rest:

        parts = rest.split("_pulse_", 1)

        if len(parts) != 2:

            return None

        try:

            channel = int(parts[0])

            pulse_ms = int(parts[1])

        except ValueError:

            return None

        if channel not in CH_PINS:

            return None

        if pulse_ms < 50:

            pulse_ms = 50

        if pulse_ms > 5000:

            pulse_ms = 5000

        return channel, True, pulse_ms



    if rest.endswith("_on"):

        suffix = "_on"

        on = True

    elif rest.endswith("_off"):

        suffix = "_off"

        on = False

    else:

        return None



    ch_str = rest[: -len(suffix)]

    try:

        channel = int(ch_str)

    except ValueError:

        return None



    if channel not in CH_PINS:

        return None



    return channel, on, None





async def exec_command(cmd):

    if _security and cmd in SECURITY_LIGHT_COMMANDS:

        log("command received: {}".format(cmd))

        handled = await _security.execute_manual_command(cmd)

        if handled:

            send_heartbeat()

            return



    parsed = _parse_channel_command(cmd)

    if parsed:

        channel, on, pulse_ms = parsed

        gpio = config.CH_GPIO[channel]

        log("command received: {}".format(cmd))

        if pulse_ms is not None:

            # ワンショット: ON → sleep → OFF（自動ボタン短絡）

            CH_PINS[channel].value(1)

            ch_states[str(channel)] = "on"

            log("CH{} PULSE ON {}ms gpio={}".format(

                channel, pulse_ms, gpio

            ))

            await asyncio.sleep_ms(pulse_ms)

            CH_PINS[channel].value(0)

            ch_states[str(channel)] = "off"

            log("CH{} PULSE OFF gpio={}".format(channel, gpio))

        else:

            CH_PINS[channel].value(1 if on else 0)

            ch_states[str(channel)] = "on" if on else "off"

            log(

                "CH{} {} gpio={}".format(

                    channel, "ON" if on else "OFF", gpio

                )

            )

        send_heartbeat()

        return



    if cmd:

        log_error("unknown command: {}".format(cmd))





async def async_main():

    global _security

    log("device: {}  fw: {}".format(config.DEVICE_ID, config.FIRMWARE_VERSION))

    for ch in sorted(CH_PINS.keys()):

        CH_PINS[ch].value(0)

        ch_states[str(ch)] = "off"

        log("CH{} GPIO{} → OFF".format(ch, config.CH_GPIO[ch]))



    for di in sorted(DI_PINS.keys()):

        input_states[str(di)] = read_di_state(di)

        log("DI{} GPIO{} → {}".format(di, config.DI_GPIO[di], input_states[str(di)].upper()))



    ifconfig = init_ethernet()

    ip = get_ip()

    if ip:

        log("IP address: {}".format(ip))

        if ifconfig:

            log("  netmask: {}  gw: {}  dns: {}".format(ifconfig[1], ifconfig[2], ifconfig[3]))

    else:

        log_error("Ethernet 未接続 — PoE/LAN ケーブル・lib/・DHCP を確認")



    if not config.REMOTE_TEST_TOKEN:

        log_error("REMOTE_TEST_TOKEN が空です — config.py を編集してください")

        return

    _security = SecurityLightController(

        set_ch_output,

        send_heartbeat,

    )

    def _read_di_for_confirm(di):

        return read_di_state(di)

    _security.set_di_reader(_read_di_for_confirm)

    log("security light control enabled (DI1/DI2 confirm 50ms)")

    rules_sync_every = int(
        getattr(config, "SECURITY_RULES_SYNC_EVERY", 10)
    )
    poll_counter = 0

    poll_security_rules()

    poll_interval_sec = int(config.POLL_INTERVAL_SEC)

    heartbeat_interval_sec = int(getattr(config, "HEARTBEAT_INTERVAL_SEC", 300))

    if heartbeat_interval_sec < poll_interval_sec:

        log_error(

            "HEARTBEAT_INTERVAL_SEC={} < POLL_INTERVAL_SEC={} — clamping heartbeat".format(

                heartbeat_interval_sec, poll_interval_sec

            )

        )

        heartbeat_interval_sec = poll_interval_sec

    heartbeat_interval_ms = heartbeat_interval_sec * 1000



    log(

        "polling start (poll {} sec / heartbeat {} sec)".format(

            poll_interval_sec, heartbeat_interval_sec

        )

    )

    print("")



    # 初回ループで 1 回だけ即時 heartbeat（以降は heartbeat_interval_sec 周期）

    next_heartbeat_ms = time.ticks_ms()



    while True:

        poll_counter += 1
        if poll_counter >= rules_sync_every:
            poll_counter = 0
            poll_security_rules()

        cmd = poll_command()

        if cmd:

            await exec_command(cmd)

        mapping_cmd = poll_port_mapping_command()

        if mapping_cmd:

            await exec_command(mapping_cmd)



        changed, edges = poll_inputs()

        if edges:

            handle_security_di_edges(edges)

        if changed:

            send_heartbeat()



        now = time.ticks_ms()

        if time.ticks_diff(now, next_heartbeat_ms) >= 0:

            if send_heartbeat():

                next_heartbeat_ms = time.ticks_add(now, heartbeat_interval_ms)



        await asyncio.sleep(poll_interval_sec)


def run():

    asyncio.run(async_main())


run()



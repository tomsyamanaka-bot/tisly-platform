"""

TiSLY Remote Test — 最小ファームウェア



Waveshare RP2350-POE-ETH-8DI-8RO / MicroPython v1.28.0

PoE 起動 → Ethernet 初期化 → 3 秒ごとに命令取得 / 60 秒ごとに heartbeat → CH1〜CH8 ON/OFF 実行

"""



import json

import time



from machine import Pin



import config



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



_lan = None





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





def send_heartbeat():

    path = "/api/remote-test/heartbeat"

    payload = {

        "firmware": config.FIRMWARE_VERSION,

        "chStates": dict(ch_states),

    }

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

    return True





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





def _parse_channel_command(cmd):

    """ch{N}_on / ch{N}_off を (channel, on) に分解。無効なら None。"""

    if not cmd or not cmd.startswith("ch"):

        return None



    rest = cmd[2:]

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



    return channel, on





def exec_command(cmd):

    parsed = _parse_channel_command(cmd)

    if parsed:

        channel, on = parsed

        gpio = config.CH_GPIO[channel]

        log("command received: {}".format(cmd))

        CH_PINS[channel].value(1 if on else 0)

        ch_states[str(channel)] = "on" if on else "off"

        log("EXEC CH{} {}".format(channel, "ON" if on else "OFF"))

        send_heartbeat()

    elif cmd:

        log_error("unknown command: {}".format(cmd))





def run():

    log("device: {}  fw: {}".format(config.DEVICE_ID, config.FIRMWARE_VERSION))

    for ch in sorted(CH_PINS.keys()):

        CH_PINS[ch].value(0)

        ch_states[str(ch)] = "off"

        log("CH{} GPIO{} → OFF".format(ch, config.CH_GPIO[ch]))



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



    poll_interval_sec = int(config.POLL_INTERVAL_SEC)

    heartbeat_interval_sec = int(getattr(config, "HEARTBEAT_INTERVAL_SEC", 60))

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

        cmd = poll_command()

        if cmd:

            exec_command(cmd)



        now = time.ticks_ms()

        if time.ticks_diff(now, next_heartbeat_ms) >= 0:

            if send_heartbeat():

                next_heartbeat_ms = time.ticks_add(now, heartbeat_interval_ms)



        time.sleep(poll_interval_sec)





run()



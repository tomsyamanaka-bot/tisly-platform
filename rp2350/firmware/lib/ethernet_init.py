"""
Waveshare RP2350-POE-ETH-8DI-8RO — Ethernet 初期化

02_MQTT サンプル lib/ethernet_init.py 相当（TiSLY remote-test 向け）。
main.py フォールバック #3 から import されます。

Waveshare 同梱 MicroPython v1.28.0 UF2 では network.LAN() が使える場合があります。
"""

import time

from machine import Pin, SPI

from w5500_pins import CS, INT, MISO, MOSI, RST, SCK, SPI_ID

_nic = None


def _kick(kick):
    """待ち時間の途中でもウォッチドッグを蹴る。"""
    if kick is None:
        return
    try:
        kick()
    except Exception:
        pass


def _wait_connected(nic, timeout_sec=15, kick=None):
    """リンク待ち。失敗しても例外は出さない。"""
    deadline = time.ticks_add(time.ticks_ms(), int(timeout_sec * 1000))
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        _kick(kick)
        try:
            if nic.isconnected():
                return True
        except Exception:
            return False
        time.sleep_ms(200)
    try:
        return nic.isconnected()
    except Exception:
        return False


def _usable(info):
    """0.0.0.0 は未取得として扱う。"""
    try:
        ip = info[0]
    except Exception:
        return False
    return bool(ip) and ip != "0.0.0.0"


def _apply_static(nic, static, kick=None):
    """DHCP 失敗時だけ予備の固定 IP を入れる。"""
    if not static:
        return None
    try:
        nic.ifconfig(tuple(static))
        _kick(kick)
        time.sleep_ms(300)
        _kick(kick)
        info = nic.ifconfig()
        print("[ethernet_init] static", info)
        if _usable(info):
            return info
    except Exception as exc:
        print("[ethernet_init] static:", exc)
    return None


def _activate_dhcp(nic):
    try:
        nic.ifconfig("dhcp")
    except TypeError:
        nic.ifconfig(["0.0.0.0", "255.255.255.0", "0.0.0.0", "8.8.8.8"])


def ethernet_init(static=None, kick=None, timeout_sec=15):
    """
    W5500 を初期化し ifconfig を返す。
    DHCP が失敗したら static の予備 IP を入れる。
    初期化そのものが失敗しても None を返し、例外は出さない。
    """
    global _nic

    # 1) Waveshare カスタム firmware: network.LAN()
    try:
        import network

        if hasattr(network, "LAN"):
            lan = network.LAN()
            try:
                if not lan.isconnected():
                    lan.active(True)
                    _wait_connected(lan, timeout_sec, kick)
            except Exception as exc:
                print("[ethernet_init] LAN active:", exc)
            if lan.isconnected():
                info = lan.ifconfig()
                if _usable(info):
                    _nic = lan
                    return info
            info = _apply_static(lan, static, kick)
            if info:
                _nic = lan
                return info
    except Exception as e:
        print("[ethernet_init] network.LAN:", e)

    # 2) MicroPython network.WIZNET5K + SPI
    try:
        import network

        if hasattr(network, "WIZNET5K"):
            spi = SPI(
                SPI_ID,
                baudrate=2_000_000,
                polarity=0,
                phase=0,
                sck=Pin(SCK),
                mosi=Pin(MOSI),
                miso=Pin(MISO),
            )
            try:
                nic = network.WIZNET5K(spi, Pin(CS), Pin(RST), Pin(INT))
            except TypeError:
                nic = network.WIZNET5K(spi, Pin(CS), Pin(RST))
            nic.active(True)
            _activate_dhcp(nic)
            _wait_connected(nic, timeout_sec, kick)
            if nic.isconnected():
                info = nic.ifconfig()
                if _usable(info):
                    _nic = nic
                    return info
            info = _apply_static(nic, static, kick)
            if info:
                _nic = nic
                return info
    except Exception as e:
        print("[ethernet_init] network.WIZNET5K:", e)

    return None


def get_nic():
    """初期化済み NIC を返す（未初期化なら None）。"""
    return _nic

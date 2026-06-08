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


def _wait_connected(nic, timeout_sec=15):
    deadline = time.ticks_add(time.ticks_ms(), int(timeout_sec * 1000))
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        if nic.isconnected():
            return True
        time.sleep_ms(200)
    return nic.isconnected()


def _activate_dhcp(nic):
    try:
        nic.ifconfig("dhcp")
    except TypeError:
        nic.ifconfig(["0.0.0.0", "255.255.255.0", "0.0.0.0", "8.8.8.8"])


def ethernet_init():
    """
    W5500 Ethernet を初期化し ifconfig タプル (ip, netmask, gw, dns) を返す。
    失敗時は None。
    """
    global _nic

    # 1) Waveshare カスタム firmware: network.LAN()
    try:
        import network

        if hasattr(network, "LAN"):
            lan = network.LAN()
            if not lan.isconnected():
                lan.active(True)
                _wait_connected(lan)
            if lan.isconnected():
                _nic = lan
                return lan.ifconfig()
    except Exception as e:
        print("[ethernet_init] network.LAN:", e)

    # 2) MicroPython network.WIZNET5K + SPI
    try:
        import network

        if hasattr(network, "WIZNET5K"):
            spi = SPI(
                SPI_ID,
                baudrate=20_000_000,
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
            _wait_connected(nic)
            if nic.isconnected():
                _nic = nic
                return nic.ifconfig()
    except Exception as e:
        print("[ethernet_init] network.WIZNET5K:", e)

    return None


def get_nic():
    """初期化済み NIC を返す（未初期化なら None）。"""
    return _nic

"""Waveshare RP2350 PoE Ethernet and HTTPS helper."""

import json
import time

try:
    import urequests
except ImportError:
    urequests = None


class NetworkManager:
    def __init__(self, config):
        self.config = config
        self.nic = None

    def _wait_for_link(self, timeout_ms=20000):
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        while time.ticks_diff(deadline, time.ticks_ms()) > 0:
            if self.nic and self.nic.isconnected():
                return True
            time.sleep_ms(200)
        return bool(self.nic and self.nic.isconnected())

    def connect(self):
        """Connect with DHCP using board LAN or W5500 SPI."""
        import network

        try:
            if hasattr(network, "LAN"):
                self.nic = network.LAN()
                self.nic.active(True)
                if self._wait_for_link():
                    return self.nic.ifconfig()
        except Exception as exc:
            print("[network] LAN:", exc)

        from machine import Pin, SPI

        eth = self.config.get("ethernet", {})
        spi = SPI(
            int(eth.get("spi_id", 0)),
            baudrate=20_000_000,
            polarity=0,
            phase=0,
            sck=Pin(int(eth.get("sck", 34))),
            mosi=Pin(int(eth.get("mosi", 35))),
            miso=Pin(int(eth.get("miso", 36))),
        )
        self.nic = network.WIZNET5K(
            spi,
            Pin(int(eth.get("cs", 33))),
            Pin(int(eth.get("reset", 25))),
        )
        self.nic.active(True)
        try:
            self.nic.ifconfig("dhcp")
        except (TypeError, ValueError):
            pass
        if not self._wait_for_link():
            raise OSError("Ethernet DHCP timeout")
        return self.nic.ifconfig()

    def ensure_connected(self):
        if self.nic and self.nic.isconnected():
            return True
        try:
            self.connect()
            return True
        except Exception as exc:
            print("[network] reconnect:", exc)
            return False

    def request_json(self, method, path, payload=None):
        if urequests is None:
            raise RuntimeError("urequests is required")
        if not self.ensure_connected():
            raise OSError("Ethernet is offline")

        base = str(self.config["api_base"]).rstrip("/")
        headers = {
            "X-Remote-Test-Token": str(self.config["device_token"]),
            "Content-Type": "application/json",
        }
        response = None
        try:
            if method == "GET":
                response = urequests.get(base + path, headers=headers)
            else:
                response = urequests.post(
                    base + path,
                    headers=headers,
                    data=json.dumps(payload or {}),
                )
            status = response.status_code
            body = response.text
            if status < 200 or status >= 300:
                raise OSError("HTTP {}: {}".format(status, body[:120]))
            return json.loads(body) if body else {}
        finally:
            if response is not None:
                response.close()

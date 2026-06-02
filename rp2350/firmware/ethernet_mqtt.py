"""
Waveshare W5500 + MQTT 接続ラッパー。

実機では Waveshare 同梱の 02_MQTT サンプル内の
ethernet_init / mqtt_connect 相当をここに移植する。

このリポジトリ版はスタブ。実機到着後:
1. Waveshare demo の lib/ をボードへコピー
2. 本ファイルの connect_network_and_mqtt() をサンプルコードで実装
"""

from config_store import load_mqtt, load_gpio


def connect_network_and_mqtt(mqtt_cfg=None):
    """
    Returns umqtt MQTTClient or None.

    Implementation steps (on hardware):
    - Import W5500 driver from Waveshare package
    - ethernet_init() with network.json / DHCP
    - MQTTClient.connect(broker_host, broker_port)
    """
    _ = load_mqtt() if mqtt_cfg is None else mqtt_cfg
    _ = load_gpio()
    print(
        "ethernet_mqtt: STUB — copy Waveshare 02_MQTT into this module on device"
    )
    return None

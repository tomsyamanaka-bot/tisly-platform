"""
Keep Rising の RP2350 設定。
実機ではこのファイルを config.py として置く。
リレー判断は keeprising_security が持つ。
"""

# TiSLY VPS（末尾スラッシュなし）
API_BASE = "https://tisly.jp"

TENANT_ID = "KEEPRISING001"
SITE_ID = "SEC-JP-KEEPRISING-001"
HOME_SITE_ID = "HOME-JP-KEEPRISING"
DEVICE_ID = "rp2350-keeprising-main-01"

# VPS の REMOTE_TEST_TOKEN と同じ値
REMOTE_TEST_TOKEN = "tisly2026test"

# 生存確認は 5 分。命令は短い周期で取る
HEARTBEAT_INTERVAL_SEC = 300
COMMAND_POLL_MS = 800
WDT_TIMEOUT_MS = 8000

# DHCP 失敗時の予備固定 IP（現場 LAN は未確定）
STATIC_IP = "192.168.1.210"
STATIC_MASK = "255.255.255.0"
STATIC_GATEWAY = "192.168.1.1"
STATIC_DNS = "8.8.8.8"
DHCP_TIMEOUT_SEC = 5

# オンボード WS2812（Waveshare = GPIO2）
RGB_LED_PIN = 2
RGB_LED_COUNT = 1

# Waveshare RP2350-POE-ETH-8DI-8RO
# RO1〜RO8 = GPIO17〜24 / DI1〜DI8 = GPIO9〜16
CH_GPIO = {
    1: 17,
    2: 18,
    3: 19,
    4: 20,
    5: 21,
    6: 22,
    7: 23,
    8: 24,
}
DI_GPIO = {
    1: 9,
    2: 10,
    3: 11,
    4: 12,
    5: 13,
    6: 14,
    7: 15,
    8: 16,
}

# 接点 ON = GPIO LOW。コイル ON = HIGH
DI_ACTIVE_LOW = True
RO_ACTIVE_LOW = False
DI_DEBOUNCE_MS = 50

# 既定の稼働時間。画面の決定後に上書きされる
SCHEDULE_START = "20:00"
SCHEDULE_END = "06:00"
DURATION_SEC = 30

# 版番号は直下 npm run build が揃える
FIRMWARE_VERSION = "1.2.59"
OTA_SITE = "keeprising"
OTA_VERSION = "1.2.59"
OTA_CHANNEL = "production"

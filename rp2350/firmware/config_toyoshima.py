"""
豊島邸 RP2350 設定 — Thonny / flash で config.py として保存

母屋（主装置 8ch）: BUILDING = "main"
はなれ（子機 6ch）: BUILDING = "detached"
"""

# TiSLY VPS API ベース URL（末尾スラッシュなし）
API_BASE = "https://tisly.jp"

# 豊島邸 物件識別子
TENANT_ID = "TOYOSHIMA001"
SITE_ID = "SEC-JP-TOYOSHIMA-001"
HOME_SITE_ID = "HOME-JP-TOYOSHIMA"

# 建物区分: "main"（母屋） / "detached"（はなれ）
BUILDING = "main"

# VPS server/.env の REMOTE_TEST_TOKEN と同じ値
REMOTE_TEST_TOKEN = "tisly2026test"

# デバイス識別子（母屋 / はなれで切替）
DEVICE_ID = "rp2350-toyoshima-main-01"
# はなれ例: DEVICE_ID = "rp2350-toyoshima-detached-01"

# 防犯ルール同期用（HOME 側 ID）
SECURITY_RULES_SITE_ID = "HOME-JP-TOYOSHIMA"
SECURITY_RULES_SYNC_EVERY = 10

# 命令取得ポーリング間隔（秒）
POLL_INTERVAL_SEC = 3

# 生存確認 heartbeat（秒）— 5 分周期
HEARTBEAT_INTERVAL_SEC = 300
heartbeat_interval_sec = HEARTBEAT_INTERVAL_SEC

# 物理 WDT タイムアウト（ms）
WDT_TIMEOUT_MS = 8000

# DHCP 失敗時の固定 IP（フォールバック）
STATIC_IP = "192.168.1.235"
STATIC_MASK = "255.255.255.0"
STATIC_GATEWAY = "192.168.1.1"
STATIC_DNS = "8.8.8.8"
DHCP_TIMEOUT_SEC = 12

# オンボード WS2812 RGB（Waveshare ETH-8DI-8RO = GPIO2）
RGB_LED_PIN = 2
RGB_LED_COUNT = 1

# CH1〜CH8 リレー GPIO（Waveshare 02_MQTT サンプル）
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

# DI1〜DI8 デジタル入力 GPIO
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

# 入力は active-low（接点 ON = GPIO LOW）
DI_ACTIVE_LOW = True

# DI ハードデバウンス（ms）— 豊島邸 100ms
DI_DEBOUNCE_MS = 100

# ファームウェア版
FIRMWARE_VERSION = "1.1.0-toyoshima-online"

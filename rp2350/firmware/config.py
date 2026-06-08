"""
TiSLY Remote Test — 設定（Thonny で編集）

RP2350 ボード直下に config.py として保存してください。
"""

# TiSLY VPS API ベース URL（末尾スラッシュなし）
API_BASE = "https://tisly.jp"

# VPS server/.env の REMOTE_TEST_TOKEN と同じ値
REMOTE_TEST_TOKEN = "tisly2026test"

# デバイス識別子（将来拡張用・ログ表示）
DEVICE_ID = "rp2350-remote-test-01"

# 命令取得ポーリング間隔（秒）
POLL_INTERVAL_SEC = 3

# 生存確認（heartbeat）送信間隔（秒）
HEARTBEAT_INTERVAL_SEC = 60
heartbeat_interval_sec = HEARTBEAT_INTERVAL_SEC  # main.py 互換エイリアス

# CH1 リレー出力 GPIO（RO1 — 実機確認済み）
CH1_GPIO = 17

# CH1〜CH8 リレー GPIO（Waveshare 02_MQTT サンプル: GPIO17〜24）
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

# DI1〜DI8 デジタル入力 GPIO（Waveshare サンプル: GPIO9〜16）
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

# ファームウェア版（PWA「RP2350接続時刻」画面に表示）
FIRMWARE_VERSION = "1.4.0-remote-test-phase6"

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

# ポーリング間隔（秒）
POLL_INTERVAL_SEC = 3

# CH1 リレー出力 GPIO（RO1 暫定）
CH1_GPIO = 17

# ファームウェア版（PWA「RP2350接続時刻」画面に表示）
FIRMWARE_VERSION = "1.0.0-remote-test"

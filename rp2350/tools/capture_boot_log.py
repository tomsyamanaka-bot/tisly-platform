"""RP2350 の起動ログを USB シリアルから採取する。

実機を触れない遠隔作業のため、
リセット直後の出力をそのまま残す。

使い方:
    python rp2350/tools/capture_boot_log.py COM6 90
"""

from __future__ import annotations

import sys
import time

import serial


def main() -> int:
    port = sys.argv[1] if len(sys.argv) > 1 else "COM6"
    seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 60.0
    # 端末が cp932 でも日本語ログで落ちない
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    with serial.Serial(port, 115200, timeout=0.5) as ser:
        # 実行中のプログラムを止めてから
        # ソフトリセットで再起動させる
        ser.write(b"\x03")
        time.sleep(0.3)
        ser.write(b"\x03")
        time.sleep(0.3)
        ser.reset_input_buffer()
        ser.write(b"\x04")

        deadline = time.time() + seconds
        buf = b""
        while time.time() < deadline:
            chunk = ser.read(4096)
            if not chunk:
                continue
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                text = line.decode("utf-8", "replace").rstrip("\r")
                print(text, flush=True)
        if buf:
            print(buf.decode("utf-8", "replace"), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
豊島邸 RP2350 USB 自動書き込みヘルパー

MicroPython ボードへ mpremote でファームを転送し、
リセットして起動する。

使い方:
  python tools/flash_rp2350.py
  python tools/flash_rp2350.py --building detached
  python tools/flash_rp2350.py --port COM5 --building main
  npm run flash:toyoshima -- --building main
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FW_DIR = ROOT / "rp2350" / "firmware"

# 実機ルートへ転送するファイル
CORE_FILES = (
    "boot.py",
    "toyoshima_security.py",
    "toshima_security.py",
)
OTA_LIB = "lib/tisly_ota.py"
RGB_LIB = "lib/tisly_rgb.py"
WDT_LIB = "lib/tisly_wdt.py"
USB_LIB = "lib/tisly_usb_safe.py"
SELF_TEST = "tisly_self_test.py"


def _run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    print("+", " ".join(cmd))
    return subprocess.run(cmd, check=check)


def _find_mpremote() -> str:
    exe = shutil.which("mpremote")
    if exe:
        return exe
    # python -m mpremote フォールバック
    return ""


def _ensure_mpremote() -> list[str]:
    """mpremote 起動コマンドを返す。"""
    # Windows は python -m が確実
    probe = subprocess.run(
        [sys.executable, "-m", "mpremote", "version"],
        capture_output=True,
        text=True,
    )
    if probe.returncode == 0:
        return [sys.executable, "-m", "mpremote"]

    exe = _find_mpremote()
    if exe:
        return [exe]

    print("mpremote が見つかりません - pip install します")
    _run([sys.executable, "-m", "pip", "install", "mpremote"], check=False)
    probe2 = subprocess.run(
        [sys.executable, "-m", "mpremote", "version"],
        capture_output=True,
        text=True,
    )
    if probe2.returncode == 0:
        return [sys.executable, "-m", "mpremote"]
    exe = _find_mpremote()
    if exe:
        return [exe]
    return [sys.executable, "-m", "mpremote"]


def _run_timeout(
    cmd: list[str], timeout_sec: int = 60, check: bool = True
) -> subprocess.CompletedProcess:
    print("+", " ".join(cmd))
    return subprocess.run(cmd, check=check, timeout=timeout_sec)


def _detect_com_port() -> str | None:
    """Windows で Raspberry Pi VID_2E8A の COM を探す。"""
    if sys.platform != "win32":
        return None
    try:
        import serial.tools.list_ports  # type: ignore
    except ImportError:
        try:
            _run(
                [sys.executable, "-m", "pip", "install", "pyserial"],
                check=False,
            )
            import serial.tools.list_ports  # type: ignore
        except Exception:
            return None
    for p in serial.tools.list_ports.comports():
        hwid = (p.hwid or "") + " " + (p.description or "")
        if "VID:PID=2E8A" in hwid.upper() or "2E8A" in hwid.upper():
            return p.device
        if re.search(r"Pico|RP2350|Waveshare", hwid, re.I):
            return p.device
    return None


def _render_config(building: str) -> str:
    """config_toyoshima.py を建物区分付きで生成。"""
    src = (FW_DIR / "config_toyoshima.py").read_text(encoding="utf-8")
    if building == "detached":
        src = re.sub(
            r'^BUILDING\s*=\s*".*?"',
            'BUILDING = "detached"',
            src,
            count=1,
            flags=re.M,
        )
        src = re.sub(
            r'^DEVICE_ID\s*=\s*".*?"',
            'DEVICE_ID = "rp2350-toyoshima-detached-01"',
            src,
            count=1,
            flags=re.M,
        )
    else:
        src = re.sub(
            r'^BUILDING\s*=\s*".*?"',
            'BUILDING = "main"',
            src,
            count=1,
            flags=re.M,
        )
        src = re.sub(
            r'^DEVICE_ID\s*=\s*".*?"',
            'DEVICE_ID = "rp2350-toyoshima-main-01"',
            src,
            count=1,
            flags=re.M,
        )
    return src


def _logic_version() -> str:
    text = (FW_DIR / "toyoshima_security.py").read_text(encoding="utf-8")
    found = re.search(r'FIRMWARE_LOGIC_VERSION = "([^"]+)"', text)
    return found.group(1) if found else ""


def _open_serial(port: str, wait_sec: float = 12):
    """再起動で COM が消えても、戻るまで開き直す。"""
    try:
        import serial  # type: ignore
    except ImportError:
        _run(
            [sys.executable, "-m", "pip", "install", "pyserial"],
            check=False,
        )
        import serial  # type: ignore
    last_err: Exception | None = None
    deadline = time.time() + wait_sec
    while time.time() < deadline:
        try:
            return serial.Serial(port, 115200, timeout=0.4)
        except Exception as exc:
            last_err = exc
            time.sleep(0.4)
    print("シリアルを開けません: {}".format(last_err), flush=True)
    return None


def _read_serial(port: str, seconds: float = 12) -> str:
    """リセット後の起動ログ。構文エラーをここで見る。

    USB 再列挙の一瞬は読み出しが失敗する。
    そのときはポートを開き直して続きを読む。
    """
    time.sleep(1.2)
    ser = _open_serial(port)
    if ser is None:
        return ""
    chunks: list[str] = []
    end = time.time() + seconds
    try:
        while time.time() < end:
            try:
                raw = ser.read(512)
            except Exception as exc:
                print("シリアル再接続: {}".format(exc), flush=True)
                try:
                    ser.close()
                except Exception:
                    pass
                time.sleep(0.6)
                ser = _open_serial(port, wait_sec=8)
                if ser is None:
                    break
                continue
            if raw:
                chunks.append(raw.decode("utf-8", "replace"))
    finally:
        try:
            if ser is not None:
                ser.close()
        except Exception:
            pass
    return "".join(chunks)


def _remote_name(dest: str) -> str:
    """:main.py を実機のパスに戻す。"""
    name = dest[1:] if dest.startswith(":") else dest
    return name.replace("\\", "/")


def _append_cmd(piece: bytes) -> str:
    """追記コマンド。% 書式はバイト列で壊れる。"""
    # repr に % や引用符が入っても、
    # 連結ならホスト側の format が誤爆しない。
    return (
        "if W is not None:\n"
        " W.feed()\n"
        "n=w(" + repr(piece) + ")\n"
        "if n!=" + str(len(piece)) + ":\n"
        " raise OSError('short')\n"
    )


def _device_exec(board, source: str, timeout: float = 8):
    """生 REPL で実行し、例外本文を返す。

    print が落ちていても、
    mpremote の OK / 例外チャネルは届く。
    応答が欠けるときは成功にしない。
    """
    from mpremote.transport import TransportError

    try:
        out, err = board.exec_raw(source, timeout=timeout)
    except TransportError as exc:
        raise RuntimeError("実機応答なし: {}".format(exc)) from exc
    if err:
        text = err.decode("utf-8", "replace")
        raise RuntimeError(text[:500])
    return out


def _push_file(board, remote: str, data: bytes) -> None:
    """一時ファイルへ書き、バイト数を実機で確認する。"""
    if remote == "config.py" or remote.endswith("/config.py"):
        raise RuntimeError("config.py は転送しない")
    tmp = remote + ".new"
    folder = remote.rsplit("/", 1)[0] if "/" in remote else ""
    if folder:
        _device_exec(
            board,
            "import os\n"
            "try:\n"
            " os.mkdir(" + repr(folder) + ")\n"
            "except OSError:\n"
            " pass\n",
        )
    # 既存 WDT を給餌し、無ければ 8 秒で張り直す。
    # チャンク毎に feed するので、転送中に落ちない。
    _device_exec(
        board,
        "import machine\n"
        "try:\n"
        " W=machine.WDT(8000)\n"
        " W.feed()\n"
        "except Exception:\n"
        " W=None\n",
    )
    _device_exec(board, "f=open(" + repr(tmp) + ",'wb')\nw=f.write\n")
    step = 2048
    offset = 0
    while offset < len(data):
        piece = data[offset : offset + step]
        _device_exec(board, _append_cmd(piece), timeout=8)
        offset += len(piece)
        if offset == len(data) or offset % 16384 < step:
            print(
                "  {} {}/{}".format(remote, offset, len(data)),
                flush=True,
            )
    _device_exec(
        board,
        "if W is not None:\n"
        " W.feed()\n"
        "f.close()\n"
        "import os\n"
        "n=os.stat(" + repr(tmp) + ")[6]\n"
        "if n!=" + str(len(data)) + ":\n"
        " raise OSError('size')\n",
    )
    print("転送済 {} ({} bytes)".format(remote, len(data)), flush=True)


def _swap_in(board, remote: str) -> None:
    """サイズ確認済みの一時ファイルだけを本番名へ替える。"""
    tmp = remote + ".new"
    bak = remote + ".bakusb"
    _device_exec(
        board,
        "import os\n"
        "if W is not None:\n"
        " W.feed()\n"
        "def _rm(p):\n"
        " try:\n"
        "  os.remove(p)\n"
        " except OSError:\n"
        "  pass\n"
        "_rm(" + repr(bak) + ")\n"
        "try:\n"
        " os.rename(" + repr(remote) + "," + repr(bak) + ")\n"
        "except OSError:\n"
        " pass\n"
        "os.rename(" + repr(tmp) + "," + repr(remote) + ")\n"
        "_rm(" + repr(bak) + ")\n"
        "_rm(" + repr(tmp) + ")\n",
    )


def _confirm_version(board, version: str) -> str:
    """import せず版の行だけ読む。コンパイルで WDT を踏まない。"""
    if not version:
        return ""
    _device_exec(
        board,
        "f=open('toyoshima_security.py')\n"
        "found=''\n"
        "while True:\n"
        " s=f.readline()\n"
        " if not s:\n"
        "  break\n"
        " if 'FIRMWARE_LOGIC_VERSION' in s and '=' in s:\n"
        "  found=s.strip()\n"
        "  break\n"
        "f.close()\n"
        "if " + repr(version) + " not in found:\n"
        " raise OSError(found or 'no-version')\n",
        timeout=12,
    )
    print("実機版 {}".format(version), flush=True)
    return version


def _raw_upload(port: str, uploads: list[tuple[Path, str]]) -> str:
    """mpremote の cp は print 遮断で失敗する。

    同じ生 REPL でも、OK が戻ったときだけ次へ進む。
    本番ファイルは全チャンクのサイズ確認後に置き換える。
    config.py はここでは触らない。
    """
    from mpremote.transport import TransportError
    from mpremote.transport_serial import SerialTransport

    # read が永久待ちにならないよう、無応答は 3 秒で切る。
    board = SerialTransport(port, baudrate=115200, timeout=3)
    try:
        # ポートを開くと DTR で基板が再起動する。
        # その直後に Ctrl-C し、WDT 起動前で止める。
        board.serial.write(b"\x03\x03\x03")
        time.sleep(0.15)
        try:
            board.serial.reset_input_buffer()
        except Exception:
            pass
        try:
            board.enter_raw_repl(soft_reset=False, timeout_overall=4)
        except TransportError:
            time.sleep(0.4)
            board.serial.write(b"\x03\x03")
            board.enter_raw_repl(soft_reset=True, timeout_overall=8)
        staged: list[str] = []
        for src, dest in uploads:
            remote = _remote_name(dest)
            if remote == "config.py":
                print("config.py はスキップ", flush=True)
                continue
            _push_file(board, remote, src.read_bytes())
            staged.append(remote)
        # boot は最後に替える。途中リセットでも古い boot が残る。
        staged.sort(key=lambda name: (name == "boot.py", name == "main.py"))
        for remote in staged:
            _swap_in(board, remote)
            print("反映 {}".format(remote), flush=True)
        version = _logic_version()
        report = _confirm_version(board, version)
        try:
            board.exec_raw("import machine\nmachine.reset()\n", timeout=2)
        except Exception:
            pass
        return report
    finally:
        try:
            board.close()
        except Exception:
            pass


def _interrupt_board(port: str) -> None:
    """動いている main を止める。ログが混ざると転送が壊れる。"""
    try:
        import serial  # type: ignore
    except ImportError:
        return
    try:
        ser = serial.Serial(port, 115200, timeout=0.2)
    except Exception as exc:
        print("割り込みポートを開けません: {}".format(exc))
        return
    try:
        end = time.time() + 1.5
        while time.time() < end:
            ser.write(b"\x03\x03")
            time.sleep(0.05)
        ser.write(b"\x02")
        time.sleep(0.2)
        ser.read(4096)
    finally:
        ser.close()
    time.sleep(0.3)


def _boot_log_failed(text: str) -> bool:
    """起動を止めた例外だけを失敗にする。捕捉ログは通す。"""
    if "Traceback" in text or "SyntaxError" in text:
        return True
    return False


def flash(
    building: str,
    port: str | None,
    dry_run: bool,
    keep_config: bool,
) -> int:
    building = "detached" if building == "detached" else "main"
    label = (
        "はなれ（子機・6回路）"
        if building == "detached"
        else "母屋（主装置・8回路）"
    )
    print("=== 豊島邸 RP2350 書き込み: {} ===".format(label))

    with tempfile.TemporaryDirectory(prefix="tisly-flash-") as tmp:
        tmp_path = Path(tmp)
        config_path = tmp_path / "config.py"
        config_path.write_text(_render_config(building), encoding="utf-8")

        main_src = FW_DIR / "main_toyoshima.py"
        main_dst = tmp_path / "main.py"
        main_dst.write_text(
            main_src.read_text(encoding="utf-8"), encoding="utf-8"
        )

        uploads: list[tuple[Path, str]] = [(main_dst, ":main.py")]
        if keep_config:
            print("config.py は実機の端子と回線を守るため転送しない")
        else:
            uploads.insert(0, (config_path, ":config.py"))
        for name in CORE_FILES:
            src = FW_DIR / name
            if src.exists():
                uploads.append((src, ":{}".format(name)))
        ota_src = FW_DIR / OTA_LIB
        if ota_src.exists():
            uploads.append((ota_src, ":lib/tisly_ota.py"))
        rgb_src = FW_DIR / RGB_LIB
        if rgb_src.exists():
            uploads.append((rgb_src, ":lib/tisly_rgb.py"))
        for extra in (WDT_LIB, USB_LIB):
            extra_src = FW_DIR / extra
            if extra_src.exists():
                uploads.append((extra_src, ":{}".format(extra)))
        kit_src = FW_DIR / SELF_TEST
        if kit_src.exists():
            uploads.append((kit_src, ":tisly_self_test.py"))

        if dry_run:
            for src, dest in uploads:
                print("[dry-run] {} -> {}".format(src, dest))
            return 0

        if not port:
            port = _detect_com_port()
        if not port:
            print("COM が見つかりません", file=sys.stderr)
            return 1
        print("自動検出 COM: {}".format(port), flush=True)
        mp = _ensure_mpremote()
        last_exc: Exception | None = None
        for attempt in (1, 2):
            try:
                _raw_upload(port, uploads)
                last_exc = None
                break
            except Exception as exc:
                last_exc = exc
                print(
                    "生REPL転送失敗 ({}回目): {}".format(attempt, exc),
                    file=sys.stderr,
                    flush=True,
                )
                time.sleep(1.5)
        if last_exc is not None:
            print(
                "対処: 1) Thonnyを完全終了 2) USB再挿抜"
                " 3) 基板RESET押下 4) 再実行",
                file=sys.stderr,
                flush=True,
            )
            return 1
        time.sleep(2)
        try:
            _run_timeout(
                mp + ["connect", port, "reset"],
                timeout_sec=15,
                check=False,
            )
        except Exception:
            pass
        boot_log = _read_serial(port, 12)
        print("--- serial ---")
        print(boot_log or "(ログなし)")
        print("--- /serial ---")
        if _boot_log_failed(boot_log):
            print("起動ログに例外があります", file=sys.stderr)
            return 1

    print("書き込み完了 - 豊島邸 {} ファームを反映しました".format(label))
    print("確認: 起動ログに Traceback が無いこと")
    print("確認: VPS heartbeat で ONLINE / 緑点滅")
    return 0


def main() -> int:
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass
    parser = argparse.ArgumentParser(
        description="豊島邸 RP2350 USB ファーム書き込み"
    )
    parser.add_argument(
        "--building",
        choices=("main", "detached"),
        default="main",
        help="母屋 main / はなれ detached",
    )
    parser.add_argument(
        "--port",
        default=None,
        help="COM ポート（例: COM5）。省略時は自動検出",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="転送せず転送対象のみ表示",
    )
    parser.add_argument(
        "--keep-config",
        action="store_true",
        help="実機の config.py は転送しない",
    )
    args = parser.parse_args()
    return flash(args.building, args.port, args.dry_run, args.keep_config)


if __name__ == "__main__":
    raise SystemExit(main())

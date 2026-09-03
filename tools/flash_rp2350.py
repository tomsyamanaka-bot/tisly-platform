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
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FW_DIR = ROOT / "rp2350" / "firmware"

# 実機ルートへ転送するファイル
CORE_FILES = (
    "boot.py",
    "toyoshima_security.py",
    "toshima_security.py",
)


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


def flash(building: str, port: str | None, dry_run: bool) -> int:
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

        uploads: list[tuple[Path, str]] = [
            (config_path, ":config.py"),
            (main_dst, ":main.py"),
        ]
        for name in CORE_FILES:
            src = FW_DIR / name
            if src.exists():
                uploads.append((src, ":{}".format(name)))

        if dry_run:
            for src, dest in uploads:
                print("[dry-run] {} -> {}".format(src, dest))
            return 0

        mp = _ensure_mpremote()
        connect = []
        if port:
            connect = ["connect", port]
        else:
            auto = _detect_com_port()
            if auto:
                print("自動検出 COM: {}".format(auto))
                connect = ["connect", auto]
            else:
                print("COM 未指定 - mpremote の自動選択を使用")

        # 書き込み前に soft-reset を短時間試行
        try:
            _run_timeout(
                mp + connect + ["soft-reset"],
                timeout_sec=8,
                check=False,
            )
        except Exception:
            print(
                "注意: soft-reset 応答なし。"
                " RESETボタン押下後に再実行してください"
            )

        for src, dest in uploads:
            cmd = mp + connect + ["cp", str(src), dest]
            try:
                _run_timeout(cmd, timeout_sec=45)
            except subprocess.TimeoutExpired:
                print(
                    "書き込みタイムアウト: {}".format(dest),
                    file=sys.stderr,
                )
                print(
                    "対処: 1) Thonnyを完全終了 2) USB再挿抜"
                    " 3) 基板RESET押下 4) 再実行",
                    file=sys.stderr,
                )
                return 1
            except subprocess.CalledProcessError as exc:
                print(
                    "書き込み失敗: {} (exit {})".format(dest, exc.returncode),
                    file=sys.stderr,
                )
                print(
                    "ヒント: USB接続 / BOOTSEL解除 / Thonny切断を確認",
                    file=sys.stderr,
                )
                return exc.returncode or 1

        # ハードリセット相当で main.py を起動
        reset_cmd = mp + connect + ["reset"]
        try:
            _run_timeout(reset_cmd, timeout_sec=15, check=False)
        except Exception:
            pass

    print("書き込み完了 - 豊島邸 {} ファームを反映しました".format(label))
    print("確認: Thonny Shell に [豊島邸] 起動ログが出ること")
    print("確認: VPS heartbeat で ONLINE / 緑点滅")
    return 0


def main() -> int:
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
    args = parser.parse_args()
    return flash(args.building, args.port, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())

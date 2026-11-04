"""
TiSLY Remote Test — boot.py

PoE / USB 起動時に MicroPython が最初に実行します。
続けて同じ階層の main.py が自動実行されます。
OTA 失敗時はバックアップから自動復帰する。

print はここでは出さない。
RP2350 は boot.py のあいだ USB が未初期化で、
print すると送信待ちで固まり、RGB が混色のままになる。
"""

try:
    import tisly_usb_safe as _usb_safe
except ImportError:
    try:
        from lib import tisly_usb_safe as _usb_safe
    except Exception:
        _usb_safe = None

if _usb_safe is not None:
    try:
        _usb_safe.install()
        _usb_safe.show_status_red()
    except Exception:
        pass

import gc

gc.collect()

# OTA A/B ロールバック（文鎮化防止）。失敗しても例外は外へ出さない。
try:
    from tisly_ota import recover_if_needed

    recover_if_needed()
except ImportError:
    try:
        from lib.tisly_ota import recover_if_needed

        recover_if_needed()
    except Exception:
        pass
except Exception:
    try:
        import os

        def _exists(path):
            try:
                os.stat(path)
                return True
            except Exception:
                return False

        if _exists("ota_pending.txt") and _exists("main_backup.py"):
            with open("main_backup.py", "rb") as src:
                data = src.read()
            with open("main.py", "wb") as dst:
                dst.write(data)
            try:
                os.remove("ota_pending.txt")
            except Exception:
                pass
    except Exception:
        pass

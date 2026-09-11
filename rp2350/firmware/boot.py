"""
TiSLY Remote Test — boot.py

PoE / USB 起動時に MicroPython が最初に実行します。
続けて同じ階層の main.py が自動実行されます。
OTA 失敗時はバックアップから自動復帰する。
"""

import gc

gc.collect()

print("")
print("=" * 40)
print("           TISLY BOOT")
print("=" * 40)
print("")

# OTA A/B ロールバック（文鎮化防止）
try:
    from tisly_ota import recover_if_needed

    recover_if_needed()
except ImportError:
    try:
        from lib.tisly_ota import recover_if_needed

        recover_if_needed()
    except Exception:
        pass
except Exception as exc:
    print("[BOOT] OTA recover:", exc)
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
            print("[BOOT] restored main_backup.py")
    except Exception:
        pass

"""
TiSLY Remote Test — boot.py

PoE / USB 起動時に MicroPython が最初に実行します。
続けて同じ階層の main.py が自動実行されます。
"""

import gc

gc.collect()

print("")
print("=" * 40)
print("           TISLY BOOT")
print("=" * 40)
print("")

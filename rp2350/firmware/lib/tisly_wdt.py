"""TiSLY 11番ルール — RP2350 自身のセルフ回復。

物理ウォッチドッグは 8000ms。メインループが1周して戻ったときだけ
feed する。HTTP やセンサー読み取りがこの時間を超えて戻らないときは
給餌されないので、RP2350 がハードウェアリセットする。
ホスト PC には machine.WDT が無いので、初期化は None を返す。
"""

WDT_TIMEOUT_MS = 8000
# urequests が固まったとき、WDT より先に例外で戻す。
HTTP_SOCKET_TIMEOUT_SEC = 1


def init_watchdog(timeout_ms=None):
    """物理 WDT を有効にする。使えない環境では None。"""
    ms = int(WDT_TIMEOUT_MS if timeout_ms is None else timeout_ms)
    if ms < 1000:
        ms = 1000
    if ms > WDT_TIMEOUT_MS:
        ms = WDT_TIMEOUT_MS
    try:
        from machine import WDT

        return WDT(timeout=ms)
    except Exception:
        return None


def kick_watchdog(wdt):
    """1周が戻ったときだけ呼ぶ。wdt が無いときは何もしない。"""
    if wdt is None:
        return
    try:
        wdt.feed()
    except Exception:
        pass


def arm_socket_timeout(seconds=None):
    """通信ソケットの待ちを WDT より短くする。"""
    sec = HTTP_SOCKET_TIMEOUT_SEC if seconds is None else seconds
    try:
        import socket

        socket.setdefaulttimeout(sec)
    except Exception:
        pass

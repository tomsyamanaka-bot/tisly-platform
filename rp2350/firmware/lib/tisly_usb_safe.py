"""
USB ケーブルが無いとき、print で起動を止めない。

RP2350 は boot.py のあいだ USB CDC が未初期化。
ここで print すると送信待ちで固まり、
RGB が電源投入時の混色（赤+青+緑）のままになる。
ホストが無いときも、溜まった送信で固まることがある。
sys.stdin は読まない。REPL 待ちもしない。
"""

_orig = None
_drop = True
_installed = False


def host_present():
    """USB ホストがいるときだけ True。判定できない開発機は True。"""
    try:
        import sys
        import uselect
    except ImportError:
        return True
    try:
        poller = uselect.poll()
        flag = uselect.POLLIN
        hangup = getattr(uselect, "POLLHUP", 16)
        poller.register(sys.stdin, flag | hangup)
        events = poller.poll(0)
    except Exception:
        return True
    for _stream, event in events:
        if event & hangup:
            return False
    return True


def install():
    """boot.py の先頭で呼ぶ。この時点では実 print を呼ばない。"""
    global _orig, _drop, _installed
    if _installed:
        _drop = True
        return True
    try:
        import builtins
    except ImportError:
        import __builtin__ as builtins
    _orig = builtins.print

    def safe_print(*args, **kwargs):
        if _drop or not host_present():
            return
        try:
            _orig(*args, **kwargs)
        except Exception:
            return

    try:
        builtins.print = safe_print
    except Exception:
        return False
    _installed = True
    _drop = True
    return True


def arm():
    """main の先頭で呼ぶ。USB 初期化のあとなのでホストを見て出す。"""
    global _drop
    install()
    present = host_present()
    _drop = not present
    if not present:
        try:
            import os

            os.dupterm(None, 1)
        except Exception:
            try:
                import os

                os.dupterm(None)
            except Exception:
                pass
    return present


def note_host(present):
    """テストからホスト有無を固定する。"""
    global _drop, _installed
    _installed = True
    _drop = not bool(present)


def show_status_red(pin_no=2):
    """起動直後に赤を出して、混色のまま止まって見えないようにする。"""
    try:
        import tisly_rgb
    except ImportError:
        try:
            from lib import tisly_rgb
        except Exception:
            return False
    try:
        tisly_rgb.init_rgb(pin_no=pin_no, count=1)
        tisly_rgb.set_status("red")
        return True
    except Exception:
        return False

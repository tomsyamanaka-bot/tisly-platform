"""
DFRobot SEN0628 Matrix LiDAR（8x8）UART。

公式ライブラリ DFRobot_MatrixLidar と同じパケット。
ボーレートは 115200 固定。距離はミリメートル、リトルエンディアン。
TX/RX は Waveshare の UART1（GPIO4/5）。DI9-16 と DO17-24 は使わない。
"""

HEAD = 0x55
CMD_SETMODE = 1
CMD_ALL = 2
STATUS_OK = 0x53
STATUS_FAIL = 0x63
MATRIX = 8
CELL_COUNT = 64
BAUD = 115200
# ボードの RS485 用 UART。リレーとデジタル入力とは別ピン。
UART_ID = 1
UART_TX = 4
UART_RX = 5
NEAR_MM = 1200
MIN_NEAR_CELLS = 3
RANGE_MIN_MM = 20
RANGE_MAX_MM = 4000
SHIFT_CELLS = 0.75

_uart = None
_mode_ready = False
_rx = bytearray()
_previous = None
_last_post_ms = 0
_retry_after_ms = 0


def build_set_mode_packet(matrix=MATRIX):
    """8x8 測距モードへ切り替える送信パケット。"""
    mode = int(matrix)
    return bytes((HEAD, 0x00, 0x05, CMD_SETMODE, 0x00, 0x00, 0x00, mode))


def build_get_all_packet():
    """64 点の距離を要求する送信パケット。"""
    return bytes((HEAD, 0x00, 0x01, CMD_ALL))


def extract_packet(buf, expect_cmd):
    """受信バッファから成功応答のペイロードを1つ取り出す。

    戻り値は (payload or None, 残り)。
    """
    data = bytearray(buf or b"")
    i = 0
    while i < len(data):
        status = data[i]
        if status not in (STATUS_OK, STATUS_FAIL):
            i += 1
            continue
        if len(data) - i < 4:
            return None, data[i:]
        cmd = data[i + 1]
        length = data[i + 2] | (data[i + 3] << 8)
        if length > 512:
            i += 1
            continue
        end = i + 4 + length
        if len(data) < end:
            return None, data[i:]
        payload = bytes(data[i + 4:end])
        rest = data[end:]
        if status == STATUS_OK and cmd == expect_cmd:
            return payload, rest
        i = end
    return None, bytearray()


def payload_to_cells(payload):
    """128 バイトを 64 点のミリメートルにする。値は切らない。"""
    raw = bytes(payload or b"")
    if len(raw) < CELL_COUNT * 2:
        return None
    cells = []
    for i in range(CELL_COUNT):
        lo = raw[i * 2]
        hi = raw[i * 2 + 1]
        cells.append(lo | (hi << 8))
    return cells


def raw_matrix(cells):
    """64 点をそのまま返す。無効化も、距離の上限クリップもしない。"""
    out = []
    src = list(cells or [])
    for i in range(CELL_COUNT):
        if i >= len(src):
            out.append(0)
            continue
        try:
            out.append(int(src[i]))
        except Exception:
            out.append(0)
    return out


def _centroid(points):
    if not points:
        return None
    count = len(points)
    cx = 0
    cy = 0
    for x, y, _mm in points:
        cx += x
        cy += y
    return {
        "x": int(cx * 100 / count) / 100.0,
        "y": int(cy * 100 / count) / 100.0,
    }


def analyze_matrix(cells, previous=None):
    """近い点の塊から、人と移動方向を決める。"""
    near = []
    nearest = None
    index = 0
    for mm in list(cells or []):
        try:
            value = int(mm)
        except Exception:
            value = 0
        x = index % MATRIX
        y = index // MATRIX
        index += 1
        if value < RANGE_MIN_MM or value > RANGE_MAX_MM:
            continue
        if nearest is None or value < nearest:
            nearest = value
        if value <= NEAR_MM:
            near.append((x, y, value))
    present = len(near) >= MIN_NEAR_CELLS
    centroid = _centroid(near) if present else None
    direction = "none"
    if present:
        direction = "still"
        prev_c = None
        if previous and previous.get("present"):
            prev_c = previous.get("centroid")
        if centroid and prev_c:
            dx = centroid["x"] - float(prev_c.get("x") or 0)
            dy = centroid["y"] - float(prev_c.get("y") or 0)
            if abs(dx) >= SHIFT_CELLS and abs(dx) >= abs(dy):
                direction = "right" if dx > 0 else "left"
            elif abs(dy) >= SHIFT_CELLS:
                direction = "back" if dy > 0 else "forward"
    return {
        "present": present,
        "direction": direction,
        "centroid": centroid,
        "minMm": nearest,
        "nearCount": len(near),
    }


def should_publish(previous, current, now_ms, last_post_ms, interval_ms=15000):
    """変化したときと、一定間隔の定期送信。"""
    if previous is None or last_post_ms <= 0:
        return True
    if bool(previous.get("present")) != bool(current.get("present")):
        return True
    if current.get("present") and previous.get("direction") != current.get("direction"):
        return True
    try:
        elapsed = int(now_ms) - int(last_post_ms)
    except Exception:
        elapsed = interval_ms
    return elapsed >= int(interval_ms)


def _open_uart():
    global _uart
    if _uart is not None:
        return _uart
    from machine import UART, Pin

    _uart = UART(
        UART_ID,
        baudrate=BAUD,
        tx=Pin(UART_TX),
        rx=Pin(UART_RX),
        timeout=80,
        rxbuf=512,
    )
    return _uart


def _read_into(uart, buf, expect_cmd, wait_ms=250):
    import time

    deadline = time.ticks_add(time.ticks_ms(), wait_ms)
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        try:
            chunk = uart.read()
        except Exception:
            chunk = None
        if chunk:
            buf.extend(chunk)
        payload, rest = extract_packet(buf, expect_cmd)
        if payload is not None:
            buf[:] = rest
            return payload
        buf[:] = rest
        time.sleep_ms(15)
    return None


def _mark_retry(now_ms, delay_ms=10000):
    global _retry_after_ms
    import time

    try:
        _retry_after_ms = time.ticks_add(now_ms, delay_ms)
    except Exception:
        _retry_after_ms = int(now_ms) + delay_ms


def _retry_waiting(now_ms):
    import time

    if not _retry_after_ms:
        return False
    try:
        return time.ticks_diff(now_ms, _retry_after_ms) < 0
    except Exception:
        return int(now_ms) < int(_retry_after_ms)


def poll_and_post(http_post, config, now_ms=None):
    """1 回読んで、変化または定期間隔なら VPS へ POST する。"""
    global _mode_ready, _rx, _previous, _last_post_ms, _retry_after_ms
    import time

    if now_ms is None:
        try:
            now_ms = time.ticks_ms()
        except Exception:
            now_ms = 0
    if _retry_waiting(now_ms):
        return False
    try:
        uart = _open_uart()
    except Exception:
        _mark_retry(now_ms)
        return False
    if not _mode_ready:
        try:
            uart.write(build_set_mode_packet(MATRIX))
        except Exception:
            _mark_retry(now_ms)
            return False
        mode_payload = _read_into(uart, _rx, CMD_SETMODE, 250)
        if mode_payload is None:
            _mark_retry(now_ms)
            return False
        _mode_ready = True
    try:
        uart.write(build_get_all_packet())
    except Exception:
        _mark_retry(now_ms)
        return False
    payload = _read_into(uart, _rx, CMD_ALL, 250)
    cells = payload_to_cells(payload)
    if not cells:
        _mark_retry(now_ms)
        return False
    _retry_after_ms = 0
    matrix = raw_matrix(cells)
    current = analyze_matrix(matrix, _previous)
    site_id = getattr(config, "SITE_ID", "HOME-JP-ITABASHI-LIVE")
    device_id = getattr(config, "DEVICE_ID", "rp2350-itabashi-main-01")
    body = {
        "siteId": site_id,
        "deviceId": device_id,
        "matrix": matrix,
        "present": current["present"],
        "direction": current["direction"],
        "centroid": current["centroid"],
        "minMm": current["minMm"],
    }
    try:
        _text, status = http_post("/api/home/v1/itabashi/lidar", body)
    except Exception:
        _previous = current
        return False
    if status and int(status) < 300:
        _previous = current
        _last_post_ms = now_ms
        return True
    _previous = current
    return False

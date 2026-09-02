"""
後方互換エイリアス — toyoshima_security へ委譲。

旧ファイル名 toshima_security.py からの import を維持する。
"""

from toyoshima_security import *  # noqa: F401,F403
from toyoshima_security import (  # noqa: F401
    ToyoshimaBaseController,
    ToyoshimaDetachedController,
    ToyoshimaMainHouseController,
    build_heartbeat_payload,
    heartbeat_loop,
    init_watchdog,
    kick_watchdog,
    read_board_temperature_c,
    send_toyoshima_event,
    send_toyoshima_heartbeat,
)

# 旧クラス名エイリアス
ToshimaBaseController = ToyoshimaBaseController
ToshimaMainHouseController = ToyoshimaMainHouseController
ToshimaDetachedController = ToyoshimaDetachedController

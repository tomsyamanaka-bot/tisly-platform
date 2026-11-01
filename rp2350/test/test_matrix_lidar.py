#!/usr/bin/env python3
"""SEN0628 のパケットと人の移動判定。実機 UART は開かない。"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware"))

import matrix_lidar  # noqa: E402


def set_cell(cells, x, y, mm):
    cells[y * 8 + x] = mm


def test_packets():
    assert matrix_lidar.build_set_mode_packet() == bytes(
        [0x55, 0x00, 0x05, 0x01, 0x00, 0x00, 0x00, 0x08]
    )
    assert matrix_lidar.build_get_all_packet() == bytes([0x55, 0x00, 0x01, 0x02])


def test_parse_and_move():
    cells = [4000] * 64
    set_cell(cells, 6, 3, 500)
    set_cell(cells, 7, 3, 480)
    set_cell(cells, 6, 4, 520)
    payload = bytearray()
    for mm in cells:
        payload.append(mm & 0xFF)
        payload.append((mm >> 8) & 0xFF)
    frame = bytes([0x53, 0x02, len(payload) & 0xFF, (len(payload) >> 8) & 0xFF]) + bytes(
        payload
    )
    got, rest = matrix_lidar.extract_packet(b"\xff\xff" + frame, 2)
    assert rest == bytearray()
    parsed = matrix_lidar.payload_to_cells(got)
    assert parsed[6 + 3 * 8] == 500

    first = matrix_lidar.analyze_matrix(parsed, None)
    assert first["present"] is True
    assert first["direction"] == "still"

    left = [4000] * 64
    set_cell(left, 2, 3, 500)
    set_cell(left, 3, 3, 480)
    set_cell(left, 2, 4, 520)
    second = matrix_lidar.analyze_matrix(left, first)
    assert second["present"] is True
    assert second["direction"] == "left"

    clear = matrix_lidar.analyze_matrix([3000] * 64, second)
    assert clear["present"] is False
    assert clear["direction"] == "none"
    assert matrix_lidar.should_publish(first, first, 2000, 1000, 15000) is False
    assert matrix_lidar.should_publish(first, second, 2000, 1000, 15000) is True
    assert matrix_lidar.should_publish(first, first, 20000, 1000, 15000) is True


if __name__ == "__main__":
    test_packets()
    test_parse_and_move()
    print("matrix lidar ok")

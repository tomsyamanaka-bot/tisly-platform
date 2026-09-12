"""板橋実機 main.py が ADC4 温度を HB に載せることを保証する。"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN_PY = ROOT / "firmware" / "main.py"


def test_itabashi_main_heartbeat_includes_board_temp():
    src = MAIN_PY.read_text(encoding="utf-8")
    assert "def _read_board_temp_local()" in src
    assert "CORE_TEMP" in src
    assert "adc_cls(4)" in src or "ADC(4)" in src
    assert 'payload["board_temp"]' in src
    assert 'payload["boardTemp"]' in src
    assert "0.706" in src
    assert "0.001721" in src
    assert "read_board_temperature_c" in src


def test_itabashi_main_falls_back_when_toyoshima_import_fails():
    src = MAIN_PY.read_text(encoding="utf-8")
    assert "except ImportError:" in src
    assert "_read_board_temp_local()" in src


if __name__ == "__main__":
    test_itabashi_main_heartbeat_includes_board_temp()
    test_itabashi_main_falls_back_when_toyoshima_import_fails()
    print("ok")

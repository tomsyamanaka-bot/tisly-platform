#!/usr/bin/env python3
"""Redirect to simulator/test_logic_host.py."""

import runpy
import sys
from pathlib import Path

runpy.run_path(str(Path(__file__).resolve().parent / "simulator" / "test_logic_host.py"), run_name="__main__")

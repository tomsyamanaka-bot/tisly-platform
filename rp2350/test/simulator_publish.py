#!/usr/bin/env python3
"""Redirect to simulator/simulator_publish.py."""

import runpy
from pathlib import Path

runpy.run_path(str(Path(__file__).resolve().parent / "simulator" / "simulator_publish.py"), run_name="__main__")

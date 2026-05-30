#!/usr/bin/env python3
"""
TiSLY PLC Builder v5.3 — PLC / 電源推定
入力数・出力数から FX5U 型番と MeanWell 電源を自動推定する。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlcModel:
    model: str
    max_inputs: int
    max_outputs: int
    description: str


@dataclass(frozen=True)
class PowerSupply:
    model: str
    wattage: int
    max_current_a: float
    description: str


PLC_MODELS: tuple[PlcModel, ...] = (
    PlcModel("FX5UJ-24MR/ES", 14, 10, "小型: 入力14点 / 出力10点"),
    PlcModel("FX5U-32MR/ES", 16, 16, "中型: 入力16点 / 出力16点"),
    PlcModel("FX5U-48MR/ES", 24, 24, "大型: 入力24点 / 出力24点"),
)

POWER_SUPPLIES: tuple[PowerSupply, ...] = (
    PowerSupply("HDR-30-24", 30, 1.25, "小規模: センサー〜5台 / 出力〜3点"),
    PowerSupply("HDR-60-24", 60, 2.5, "中規模: センサー〜10台 / 出力〜6点"),
    PowerSupply("HDR-100-24", 100, 4.17, "大規模: センサー〜20台 / 出力〜12点"),
    PowerSupply("HDR-150-24", 150, 6.25, "超大規模: センサー30台以上"),
)

# 24V 負荷概算 (A)
SENSOR_AMPERE = 0.05
OUTPUT_24V_AMPERE = 0.35
PLC_BASE_AMPERE = 0.3


def estimate_plc(input_count: int, output_count: int) -> PlcModel:
    """入力数・出力数から最適 FX5U 型番を推定する。"""
    for plc in PLC_MODELS:
        if input_count <= plc.max_inputs and output_count <= plc.max_outputs:
            return plc
    return PLC_MODELS[-1]


def get_plc_by_model(model: str) -> PlcModel | None:
    normalized = model.upper().replace("FX5UJ", "FX5U")
    for plc in PLC_MODELS:
        if plc.model.upper().startswith(normalized.split("/")[0]):
            return plc
    return None


def estimate_power_supply(
    sensor_24v_count: int,
    output_24v_count: int,
) -> PowerSupply:
    """24V センサー数・24V 出力数から推奨 MeanWell 電源を推定する。"""
    total_a = (
        sensor_24v_count * SENSOR_AMPERE
        + output_24v_count * OUTPUT_24V_AMPERE
        + PLC_BASE_AMPERE
    )
    for psu in POWER_SUPPLIES:
        if total_a <= psu.max_current_a * 0.8:
            return psu
    return POWER_SUPPLIES[-1]


def count_24v_loads(
    input_count: int,
    output_patlite: int,
    output_buzzer: int,
    output_white_led: int,
) -> tuple[int, int]:
    """24V センサー数と 24V 出力数を返す。"""
    sensor_24v = input_count
    output_24v = output_patlite + output_buzzer
    return sensor_24v, output_24v


@dataclass
class EstimationResult:
    plc: PlcModel
    power_supply: PowerSupply
    input_count: int
    output_count: int
    sensor_24v_count: int
    output_24v_count: int
    spare_inputs: int
    spare_outputs: int
    capacity_ok: bool

    @property
    def plc_model(self) -> str:
        return self.plc.model

    @property
    def power_model(self) -> str:
        return self.power_supply.model


def estimate_all(
    input_count: int,
    output_count: int,
    *,
    output_patlite: int = 0,
    output_buzzer: int = 0,
    output_white_led: int = 0,
) -> EstimationResult:
    """PLC + 電源を一括推定。"""
    plc = estimate_plc(input_count, output_count)
    sensor_24v, output_24v = count_24v_loads(
        input_count, output_patlite, output_buzzer, output_white_led
    )
    psu = estimate_power_supply(sensor_24v, output_24v)
    return EstimationResult(
        plc=plc,
        power_supply=psu,
        input_count=input_count,
        output_count=output_count,
        sensor_24v_count=sensor_24v,
        output_24v_count=output_24v,
        spare_inputs=max(0, plc.max_inputs - input_count),
        spare_outputs=max(0, plc.max_outputs - output_count),
        capacity_ok=input_count <= plc.max_inputs and output_count <= plc.max_outputs,
    )

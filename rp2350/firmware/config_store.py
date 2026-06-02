"""Backward-compatible config API (delegates to config_loader)."""

from config_loader import (
    gpio_pin_lists,
    load_device,
    load_gpio,
    load_mqtt,
    load_network,
    load_relay_map,
    load_sensor_map,
)

__all__ = [
    "load_device",
    "load_mqtt",
    "load_gpio",
    "load_network",
    "load_relay_map",
    "load_sensor_map",
    "gpio_pin_lists",
]

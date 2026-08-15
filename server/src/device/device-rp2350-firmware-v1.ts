import path from "path";
import { fileURLToPath } from "url";
import type { DevicePortConfigurationV1 } from "./device-port-config-v1.js";

const DI_GPIO = [9, 10, 11, 12, 13, 14, 15, 16];
const RO_GPIO = [17, 18, 19, 20, 21, 22, 23, 24];
const EMERGENCY_LABEL =
  /感震|地震|遮断|警報|非常|emergency|alarm/i;

export const RP2350_FIRMWARE_FILES_V1 = [
  "main.py",
  "network_manager.py",
  "pulse_counter.py",
] as const;

export function buildRp2350ConfigV1(
  configuration: DevicePortConfigurationV1,
  deviceToken: string
): Record<string, unknown> {
  const digitalInputs = configuration.ports
    .filter((port) => port.portType === "DI")
    .map((port) => ({
      port: port.portNumber,
      gpio: DI_GPIO[port.portNumber - 1],
      enabled: port.enabled,
      label: port.label,
      active_low: port.contactPolarity === "a",
      mode: port.operationMode,
      pulse_weight: port.pulseWeight,
      pulse_unit: port.pulseUnit.replace("m³", "m3"),
      initial_meter_value: port.initialMeterValue,
      emergency:
        port.operationMode === "state_monitor" &&
        EMERGENCY_LABEL.test(port.label),
    }));
  const relayOutputs = configuration.ports
    .filter((port) => port.portType === "RO")
    .map((port) => ({
      port: port.portNumber,
      gpio: RO_GPIO[port.portNumber - 1],
      enabled: port.enabled,
      label: port.label,
      active_low: port.contactPolarity === "b",
    }));

  return {
    schema_version: 1,
    device_id: configuration.deviceId,
    property_id: configuration.propertyId,
    customer_code: configuration.customerCode,
    api_base: "https://tisly.jp",
    device_token: deviceToken,
    pulse_telemetry_path: "/api/meter/telemetry",
    telemetry_path: "/api/device/ports/telemetry",
    emergency_path: "/api/device/ports/emergency",
    command_path: "/api/device/ports/command",
    poll_interval_ms: 3000,
    telemetry_interval_ms: 60000,
    debounce_ms: Math.max(50, configuration.debounceMs),
    flash_save_interval_ms: 5000,
    ethernet: {
      dhcp: true,
      spi_id: 0,
      sck: 34,
      mosi: 35,
      miso: 36,
      cs: 33,
      reset: 25,
    },
    digital_inputs: digitalInputs,
    relay_outputs: relayOutputs,
    rs485_devices: configuration.rs485Devices,
    field_note: configuration.fieldNote,
  };
}

export function getRp2350FirmwarePathV1(fileName: string): string {
  if (
    !RP2350_FIRMWARE_FILES_V1.includes(
      fileName as (typeof RP2350_FIRMWARE_FILES_V1)[number]
    )
  ) {
    throw new Error("firmware file not found");
  }
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(
    moduleDir,
    "../../../firmware/rp2350",
    fileName
  );
}

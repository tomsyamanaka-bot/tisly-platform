import { getDatabase } from "../db/database.js";
import {
  getDeviceBindingV1,
  normalizeDeviceIdV1,
} from "./property-device-binding-v1.js";

export const DEVICE_PORT_COUNT_V1 = 8;
export const DEVICE_INPUT_DEBOUNCE_MS_V1 = 50;

export type DevicePortTypeV1 = "DI" | "RO";
export type DeviceOperationModeV1 =
  | "pulse"
  | "state_monitor";
export type DeviceContactPolarityV1 = "a" | "b";

export interface DevicePortConfigV1 {
  portType: DevicePortTypeV1;
  portNumber: number;
  enabled: boolean;
  label: string;
  operationMode: DeviceOperationModeV1;
  contactPolarity: DeviceContactPolarityV1;
  pulseWeight: number;
  pulseUnit: string;
  initialMeterValue: number;
}

export interface DeviceRs485ConfigV1 {
  modbusAddress: number;
  equipmentName: string;
}

export interface DevicePortConfigurationV1 {
  deviceId: string;
  propertyId: string;
  customerCode: string;
  debounceMs: number;
  ports: DevicePortConfigV1[];
  rs485Devices: DeviceRs485ConfigV1[];
  fieldNote: string;
  updatedAt: string | null;
}

type IoStateV1 = "on" | "off";

export interface DeviceLiveStateV1 {
  inputStates: Record<string, IoStateV1>;
  relayStates: Record<string, IoStateV1>;
  lastSeenAt: string | null;
  pulseCounts?: Record<string, number>;
  meterValues?: Record<string, number>;
  lastEmergency?: DeviceEmergencyEventV1;
}

export interface DeviceEmergencyEventV1 {
  deviceId: string;
  propertyId: string;
  portNumber: number;
  label: string;
  active: boolean;
  receivedAt: string;
}

export interface DeviceMappedPortLiveV1 extends DevicePortConfigV1 {
  deviceId: string;
  pulseCount: number | null;
  currentMeterValue: number | null;
  todayUsageM3: number;
  live: boolean;
  lastSeenAt: string | null;
}

export interface PropertyGasLiveSnapshotV1 {
  ports: DeviceMappedPortLiveV1[];
  deviceIds: string[];
  meterPulseTotal: number | null;
  currentMeterValue: number | null;
  todayUsageM3: number | null;
  emergencyActive: boolean;
  lastEmergency: DeviceEmergencyEventV1 | null;
  lastUpdatedAt: string | null;
}

export interface DeviceRelayCommandV1 {
  command: string;
  portNumber: number;
  on: boolean;
  queuedAt: string;
}

const liveStates = new Map<string, DeviceLiveStateV1>();
const relayCommands = new Map<string, DeviceRelayCommandV1[]>();
const PORT_TYPES = new Set<DevicePortTypeV1>(["DI", "RO"]);
const MODES = new Set<DeviceOperationModeV1>([
  "pulse",
  "state_monitor",
]);
const POLARITIES = new Set<DeviceContactPolarityV1>(["a", "b"]);
const PULSE_UNITS = new Set([
  "m³/P",
  "L/P",
  "kWh/P",
  "P",
]);

function isPortNumber(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 1 &&
    value <= DEVICE_PORT_COUNT_V1
  );
}

function defaultPort(
  portType: DevicePortTypeV1,
  portNumber: number
): DevicePortConfigV1 {
  return {
    portType,
    portNumber,
    enabled: false,
    label: "",
    operationMode: "pulse",
    contactPolarity: "a",
    pulseWeight: 0.01,
    pulseUnit: "m³/P",
    initialMeterValue: 0,
  };
}

export function buildDefaultDevicePortsV1(): DevicePortConfigV1[] {
  const ports: DevicePortConfigV1[] = [];
  for (const portType of ["DI", "RO"] as const) {
    for (
      let portNumber = 1;
      portNumber <= DEVICE_PORT_COUNT_V1;
      portNumber += 1
    ) {
      ports.push(defaultPort(portType, portNumber));
    }
  }
  return ports;
}

function rowToPort(
  row: Record<string, unknown>
): DevicePortConfigV1 {
  return {
    portType: String(row.port_type) as DevicePortTypeV1,
    portNumber: Number(row.port_number),
    enabled: Number(row.enabled) === 1,
    label: String(row.label ?? ""),
    operationMode: String(
      row.operation_mode
    ) as DeviceOperationModeV1,
    contactPolarity: String(
      row.contact_polarity
    ) as DeviceContactPolarityV1,
    pulseWeight: Number(row.pulse_weight),
    pulseUnit: String(row.pulse_unit),
    initialMeterValue: Number(row.initial_meter_value),
  };
}

function normalizePort(
  input: Partial<DevicePortConfigV1>
): DevicePortConfigV1 {
  const portType = String(
    input.portType ?? ""
  ).toUpperCase() as DevicePortTypeV1;
  const portNumber = Number(input.portNumber);
  const enabled = input.enabled === true;
  const label = String(input.label ?? "").trim();
  const operationMode = String(
    input.operationMode ?? ""
  ) as DeviceOperationModeV1;
  const contactPolarity = String(
    input.contactPolarity ?? ""
  ) as DeviceContactPolarityV1;
  const pulseWeight = Number(input.pulseWeight);
  const pulseUnit = String(input.pulseUnit ?? "").trim();
  const initialMeterValue = Number(input.initialMeterValue);

  if (!PORT_TYPES.has(portType) || !isPortNumber(portNumber)) {
    throw new Error("invalid port");
  }
  if (enabled && !label) {
    throw new Error(`${portType}${portNumber} の名称を入力してください`);
  }
  if (label.length > 100) throw new Error("port label too long");
  if (!MODES.has(operationMode)) {
    throw new Error("invalid operation mode");
  }
  if (!POLARITIES.has(contactPolarity)) {
    throw new Error("invalid contact polarity");
  }
  if (!Number.isFinite(pulseWeight) || pulseWeight <= 0) {
    throw new Error("invalid pulse weight");
  }
  if (!PULSE_UNITS.has(pulseUnit)) {
    throw new Error("invalid pulse unit");
  }
  if (
    !Number.isFinite(initialMeterValue) ||
    initialMeterValue < 0
  ) {
    throw new Error("invalid initial meter value");
  }

  return {
    portType,
    portNumber,
    enabled,
    label,
    operationMode,
    contactPolarity,
    pulseWeight,
    pulseUnit,
    initialMeterValue,
  };
}

function normalizeRs485(
  input: Partial<DeviceRs485ConfigV1>
): DeviceRs485ConfigV1 {
  const modbusAddress = Number(input.modbusAddress);
  const equipmentName = String(input.equipmentName ?? "").trim();
  if (
    !Number.isInteger(modbusAddress) ||
    modbusAddress < 1 ||
    modbusAddress > 32
  ) {
    throw new Error("Modbusアドレスは1〜32で入力してください");
  }
  if (!equipmentName) {
    throw new Error("RS485機器名称を入力してください");
  }
  if (equipmentName.length > 100) {
    throw new Error("RS485 equipment name too long");
  }
  return { modbusAddress, equipmentName };
}

function requireBinding(deviceId: string) {
  const binding = getDeviceBindingV1(deviceId);
  if (!binding) throw new Error("device binding not found");
  return binding;
}

export function getDevicePortConfigurationV1(
  rawDeviceId: unknown
): DevicePortConfigurationV1 {
  const deviceId = normalizeDeviceIdV1(rawDeviceId);
  const binding = requireBinding(deviceId);
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM device_port_configs_v1
       WHERE device_id = ?
       ORDER BY port_type, port_number`
    )
    .all(deviceId) as Array<Record<string, unknown>>;
  const savedByKey = new Map(
    rows.map((row) => {
      const port = rowToPort(row);
      return [`${port.portType}${port.portNumber}`, port] as const;
    })
  );
  const ports = buildDefaultDevicePortsV1().map(
    (port) =>
      savedByKey.get(`${port.portType}${port.portNumber}`) ?? port
  );
  const rs485Devices = (
    getDatabase()
      .prepare(
        `SELECT modbus_address, equipment_name
         FROM device_rs485_configs_v1
         WHERE device_id = ?
         ORDER BY modbus_address`
      )
      .all(deviceId) as Array<Record<string, unknown>>
  ).map((row) => ({
    modbusAddress: Number(row.modbus_address),
    equipmentName: String(row.equipment_name),
  }));
  const noteRow = getDatabase()
    .prepare(
      `SELECT field_note, updated_at
       FROM device_field_notes_v1
       WHERE device_id = ?`
    )
    .get(deviceId) as
    | { field_note: string; updated_at: string }
    | undefined;
  const portUpdated = getDatabase()
    .prepare(
      `SELECT MAX(updated_at) AS updated_at
       FROM device_port_configs_v1
       WHERE device_id = ?`
    )
    .get(deviceId) as { updated_at: string | null };

  return {
    deviceId,
    propertyId: binding.propertyId,
    customerCode: binding.customerCode,
    debounceMs: DEVICE_INPUT_DEBOUNCE_MS_V1,
    ports,
    rs485Devices,
    fieldNote: noteRow?.field_note ?? "",
    updatedAt: noteRow?.updated_at ?? portUpdated.updated_at,
  };
}

export function saveDevicePortConfigurationV1(input: {
  deviceId: unknown;
  ports: Array<Partial<DevicePortConfigV1>>;
  rs485Devices?: Array<Partial<DeviceRs485ConfigV1>>;
  fieldNote?: unknown;
}): DevicePortConfigurationV1 {
  const deviceId = normalizeDeviceIdV1(input.deviceId);
  requireBinding(deviceId);
  if (!Array.isArray(input.ports)) {
    throw new Error("ports required");
  }
  const ports = input.ports.map(normalizePort);
  const uniquePorts = new Set(
    ports.map((port) => `${port.portType}${port.portNumber}`)
  );
  if (
    ports.length !== DEVICE_PORT_COUNT_V1 * 2 ||
    uniquePorts.size !== DEVICE_PORT_COUNT_V1 * 2
  ) {
    throw new Error("DI1〜DI8・RO1〜RO8をすべて送信してください");
  }

  const rs485Devices = (input.rs485Devices ?? []).map(normalizeRs485);
  const uniqueAddresses = new Set(
    rs485Devices.map((item) => item.modbusAddress)
  );
  if (uniqueAddresses.size !== rs485Devices.length) {
    throw new Error("Modbusアドレスが重複しています");
  }
  const fieldNote = String(input.fieldNote ?? "").trim();
  if (fieldNote.length > 4000) {
    throw new Error("field note too long");
  }

  const now = new Date().toISOString();
  const database = getDatabase();
  const upsertPort = database.prepare(
    `INSERT INTO device_port_configs_v1
     (device_id, port_type, port_number, enabled, label,
      operation_mode, contact_polarity, pulse_weight,
      pulse_unit, initial_meter_value, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(device_id, port_type, port_number)
     DO UPDATE SET
       enabled = excluded.enabled,
       label = excluded.label,
       operation_mode = excluded.operation_mode,
       contact_polarity = excluded.contact_polarity,
       pulse_weight = excluded.pulse_weight,
       pulse_unit = excluded.pulse_unit,
       initial_meter_value = excluded.initial_meter_value,
       updated_at = excluded.updated_at`
  );
  const upsertRs485 = database.prepare(
    `INSERT INTO device_rs485_configs_v1
     (device_id, modbus_address, equipment_name, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(device_id, modbus_address)
     DO UPDATE SET
       equipment_name = excluded.equipment_name,
       updated_at = excluded.updated_at`
  );
  const upsertNote = database.prepare(
    `INSERT INTO device_field_notes_v1
     (device_id, field_note, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(device_id)
     DO UPDATE SET
       field_note = excluded.field_note,
       updated_at = excluded.updated_at`
  );

  database.transaction(() => {
    for (const port of ports) {
      upsertPort.run(
        deviceId,
        port.portType,
        port.portNumber,
        port.enabled ? 1 : 0,
        port.label,
        port.operationMode,
        port.contactPolarity,
        port.pulseWeight,
        port.pulseUnit,
        port.initialMeterValue,
        now
      );
    }
    for (const item of rs485Devices) {
      upsertRs485.run(
        deviceId,
        item.modbusAddress,
        item.equipmentName,
        now
      );
    }
    upsertNote.run(deviceId, fieldNote, now);
  })();

  return getDevicePortConfigurationV1(deviceId);
}

function normalizeIoStates(
  value: unknown
): Record<string, IoStateV1> {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const states: Record<string, IoStateV1> = {};
  for (
    let portNumber = 1;
    portNumber <= DEVICE_PORT_COUNT_V1;
    portNumber += 1
  ) {
    const raw = input[String(portNumber)];
    states[String(portNumber)] =
      raw === true ||
      raw === 1 ||
      raw === "1" ||
      raw === "on" ||
      raw === "ON"
        ? "on"
        : "off";
  }
  return states;
}

function normalizeNumberMap(
  value: unknown
): Record<string, number> {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const output: Record<string, number> = {};
  for (let portNumber = 1; portNumber <= 8; portNumber += 1) {
    const number = Number(input[String(portNumber)]);
    output[String(portNumber)] =
      Number.isFinite(number) && number >= 0 ? number : 0;
  }
  return output;
}

function emptyLiveState(): DeviceLiveStateV1 {
  return {
    inputStates: normalizeIoStates({}),
    relayStates: normalizeIoStates({}),
    lastSeenAt: null,
  };
}

function readingDateJst(receivedAt: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(receivedAt));
}

function persistTelemetrySnapshotV1(
  deviceId: string,
  state: DeviceLiveStateV1
): void {
  const receivedAt = state.lastSeenAt ?? new Date().toISOString();
  const readingDate = readingDateJst(receivedAt);
  const enabledInputs = getDevicePortConfigurationV1(deviceId).ports.filter(
    (port) => port.portType === "DI" && port.enabled
  );
  const insert = getDatabase().prepare(
    `INSERT INTO device_port_telemetry_v1
     (device_id, port_number, input_state, pulse_count,
      meter_value, reading_date, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  getDatabase().transaction(() => {
    for (const port of enabledInputs) {
      const key = String(port.portNumber);
      const pulseCount = Number(state.pulseCounts?.[key] ?? 0);
      const meterValue = Number(
        state.meterValues?.[key] ??
          port.initialMeterValue + pulseCount * port.pulseWeight
      );
      insert.run(
        deviceId,
        port.portNumber,
        state.inputStates[key] ?? "off",
        pulseCount,
        meterValue,
        readingDate,
        receivedAt
      );
    }
  })();
}

function loadPersistedLiveStateV1(
  deviceId: string
): DeviceLiveStateV1 | null {
  const rows = getDatabase()
    .prepare(
      `SELECT t.port_number, t.input_state, t.pulse_count,
              t.meter_value, t.received_at
       FROM device_port_telemetry_v1 t
       INNER JOIN (
         SELECT port_number, MAX(id) AS latest_id
         FROM device_port_telemetry_v1
         WHERE device_id = ?
         GROUP BY port_number
       ) latest ON latest.latest_id = t.id
       ORDER BY t.port_number`
    )
    .all(deviceId) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  const state = emptyLiveState();
  state.pulseCounts = normalizeNumberMap({});
  state.meterValues = normalizeNumberMap({});
  for (const row of rows) {
    const key = String(Number(row.port_number));
    state.inputStates[key] =
      String(row.input_state) === "on" ? "on" : "off";
    state.pulseCounts[key] = Number(row.pulse_count);
    state.meterValues[key] = Number(row.meter_value);
    const receivedAt = String(row.received_at);
    if (!state.lastSeenAt || receivedAt > state.lastSeenAt) {
      state.lastSeenAt = receivedAt;
    }
  }
  const emergency = getDatabase()
    .prepare(
      `SELECT device_id, property_id, port_number, label,
              active, received_at
       FROM device_emergency_events_v1
       WHERE device_id = ?
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(deviceId) as Record<string, unknown> | undefined;
  if (emergency) {
    state.lastEmergency = {
      deviceId: String(emergency.device_id),
      propertyId: String(emergency.property_id),
      portNumber: Number(emergency.port_number),
      label: String(emergency.label),
      active: Number(emergency.active) === 1,
      receivedAt: String(emergency.received_at),
    };
  }
  return state;
}

export function recordDevicePortTelemetryV1(input: {
  deviceId: unknown;
  inputStates?: unknown;
  relayStates?: unknown;
  pulseCounts?: unknown;
  meterValues?: unknown;
}): DeviceLiveStateV1 {
  const deviceId = normalizeDeviceIdV1(input.deviceId);
  requireBinding(deviceId);
  const previous = liveStates.get(deviceId) ?? emptyLiveState();
  const next = {
    inputStates:
      input.inputStates == null
        ? previous.inputStates
        : normalizeIoStates(input.inputStates),
    relayStates:
      input.relayStates == null
        ? previous.relayStates
        : normalizeIoStates(input.relayStates),
    pulseCounts:
      input.pulseCounts == null
        ? previous.pulseCounts
        : normalizeNumberMap(input.pulseCounts),
    meterValues:
      input.meterValues == null
        ? previous.meterValues
        : normalizeNumberMap(input.meterValues),
    lastEmergency: previous.lastEmergency,
    lastSeenAt: new Date().toISOString(),
  };
  liveStates.set(deviceId, next);
  persistTelemetrySnapshotV1(deviceId, next);
  return next;
}

export function recordDeviceEmergencyV1(input: {
  deviceId: unknown;
  propertyId?: unknown;
  emergency?: {
    port?: unknown;
    label?: unknown;
    active?: unknown;
  };
  inputStates?: unknown;
  relayStates?: unknown;
  pulseCounts?: unknown;
  meterValues?: unknown;
}): DeviceEmergencyEventV1 {
  const deviceId = normalizeDeviceIdV1(input.deviceId);
  const binding = requireBinding(deviceId);
  const portNumber = Number(input.emergency?.port);
  if (!isPortNumber(portNumber)) {
    throw new Error("invalid emergency port");
  }
  if (
    input.propertyId != null &&
    String(input.propertyId) !== binding.propertyId
  ) {
    throw new Error("property binding mismatch");
  }
  const event: DeviceEmergencyEventV1 = {
    deviceId,
    propertyId: binding.propertyId,
    portNumber,
    label: String(input.emergency?.label ?? "").slice(0, 100),
    active: input.emergency?.active === true,
    receivedAt: new Date().toISOString(),
  };
  const state = recordDevicePortTelemetryV1(input);
  liveStates.set(deviceId, {
    ...state,
    lastEmergency: event,
  });
  getDatabase()
    .prepare(
      `INSERT INTO device_emergency_events_v1
       (device_id, property_id, port_number, label,
        active, received_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.deviceId,
      event.propertyId,
      event.portNumber,
      event.label,
      event.active ? 1 : 0,
      event.receivedAt
    );
  return event;
}

export function getDevicePortLiveStateV1(
  rawDeviceId: unknown
): DeviceLiveStateV1 & {
  deviceId: string;
  debounceMs: number;
} {
  const deviceId = normalizeDeviceIdV1(rawDeviceId);
  requireBinding(deviceId);
  return {
    deviceId,
    debounceMs: DEVICE_INPUT_DEBOUNCE_MS_V1,
    ...(liveStates.get(deviceId) ??
      loadPersistedLiveStateV1(deviceId) ??
      emptyLiveState()),
  };
}

function dailyPulseUsageV1(
  deviceId: string,
  port: DevicePortConfigV1,
  currentPulseCount: number
): number {
  const today = readingDateJst(new Date().toISOString());
  const previous = getDatabase()
    .prepare(
      `SELECT pulse_count
       FROM device_port_telemetry_v1
       WHERE device_id = ? AND port_number = ?
         AND reading_date < ?
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(deviceId, port.portNumber, today) as
    | { pulse_count: number }
    | undefined;
  const firstToday = getDatabase()
    .prepare(
      `SELECT pulse_count
       FROM device_port_telemetry_v1
       WHERE device_id = ? AND port_number = ?
         AND reading_date = ?
       ORDER BY id
       LIMIT 1`
    )
    .get(deviceId, port.portNumber, today) as
    | { pulse_count: number }
    | undefined;
  const baseline = Number(
    previous?.pulse_count ?? firstToday?.pulse_count ?? currentPulseCount
  );
  return Math.max(
    0,
    Number(
      ((currentPulseCount - baseline) * port.pulseWeight).toFixed(6)
    )
  );
}

/**
 * 既存モックを保持したまま、
 * 実機の最新値だけを画面へ重ねる。
 */
export function getPropertyGasLiveSnapshotV1(
  propertyId: string
): PropertyGasLiveSnapshotV1 {
  const mappings = listPropertyPortMappingsV1(propertyId);
  const ports: DeviceMappedPortLiveV1[] = [];
  let emergencyActive = false;
  let lastEmergency: DeviceEmergencyEventV1 | null = null;
  let lastUpdatedAt: string | null = null;

  for (const mapping of mappings) {
    const state = getDevicePortLiveStateV1(mapping.deviceId);
    if (
      state.lastSeenAt &&
      (!lastUpdatedAt || state.lastSeenAt > lastUpdatedAt)
    ) {
      lastUpdatedAt = state.lastSeenAt;
    }
    if (
      state.lastEmergency &&
      (!lastEmergency ||
        state.lastEmergency.receivedAt > lastEmergency.receivedAt)
    ) {
      lastEmergency = state.lastEmergency;
    }
    if (state.lastEmergency?.active) {
      const emergencyPort = String(state.lastEmergency.portNumber);
      emergencyActive =
        emergencyActive ||
        state.inputStates[emergencyPort] === "on";
    }

    for (const port of mapping.ports) {
      const key = String(port.portNumber);
      const isPulse =
        port.portType === "DI" && port.operationMode === "pulse";
      const pulseCount =
        isPulse && state.pulseCounts
          ? Number(state.pulseCounts[key] ?? 0)
          : null;
      const liveMeter =
        isPulse && state.meterValues
          ? Number(state.meterValues[key])
          : null;
      const currentMeterValue =
        isPulse && pulseCount != null
          ? Number(
              (
                liveMeter != null && Number.isFinite(liveMeter)
                  ? liveMeter
                  : port.initialMeterValue +
                    pulseCount * port.pulseWeight
              ).toFixed(6)
            )
          : null;
      ports.push({
        ...port,
        deviceId: mapping.deviceId,
        pulseCount,
        currentMeterValue,
        todayUsageM3:
          isPulse && pulseCount != null
            ? dailyPulseUsageV1(mapping.deviceId, port, pulseCount)
            : 0,
        live: Boolean(state.lastSeenAt),
        lastSeenAt: state.lastSeenAt,
      });
    }
  }

  const primaryPulse = ports.find(
    (port) =>
      port.portType === "DI" && port.operationMode === "pulse"
  );
  return {
    ports,
    deviceIds: mappings.map((mapping) => mapping.deviceId),
    meterPulseTotal: primaryPulse?.pulseCount ?? null,
    currentMeterValue: primaryPulse?.currentMeterValue ?? null,
    todayUsageM3: primaryPulse?.live
      ? primaryPulse.todayUsageM3
      : null,
    emergencyActive,
    lastEmergency,
    lastUpdatedAt,
  };
}

export function queueDeviceRelayTestV1(input: {
  deviceId: unknown;
  portNumber: unknown;
  on: unknown;
}): DeviceRelayCommandV1 {
  const deviceId = normalizeDeviceIdV1(input.deviceId);
  requireBinding(deviceId);
  const portNumber = Number(input.portNumber);
  if (!isPortNumber(portNumber)) {
    throw new Error("invalid relay port");
  }
  if (typeof input.on !== "boolean") {
    throw new Error("relay state required");
  }
  const command: DeviceRelayCommandV1 = {
    command: `ro${portNumber}_${input.on ? "on" : "off"}`,
    portNumber,
    on: input.on,
    queuedAt: new Date().toISOString(),
  };
  const queue = relayCommands.get(deviceId) ?? [];
  queue.push(command);
  relayCommands.set(deviceId, queue.slice(-16));
  return command;
}

export function consumeDeviceRelayCommandV1(
  rawDeviceId: unknown
): DeviceRelayCommandV1 | null {
  const deviceId = normalizeDeviceIdV1(rawDeviceId);
  requireBinding(deviceId);
  const queue = relayCommands.get(deviceId) ?? [];
  const command = queue.shift() ?? null;
  relayCommands.set(deviceId, queue);
  return command;
}

export function listPropertyPortMappingsV1(
  propertyId?: string
): Array<{
  propertyId: string;
  deviceId: string;
  ports: DevicePortConfigV1[];
}> {
  const params: string[] = [];
  let where = "WHERE p.enabled = 1";
  if (propertyId?.trim()) {
    where += " AND b.property_id = ?";
    params.push(propertyId.trim());
  }
  const rows = getDatabase()
    .prepare(
      `SELECT b.property_id, p.device_id, p.*
       FROM device_port_configs_v1 p
       INNER JOIN property_device_bindings_v1 b
         ON b.device_id = p.device_id
       ${where}
       ORDER BY b.bound_at DESC, b.property_id,
         p.device_id, p.port_type, p.port_number`
    )
    .all(...params) as Array<Record<string, unknown>>;
  const grouped = new Map<
    string,
    {
      propertyId: string;
      deviceId: string;
      ports: DevicePortConfigV1[];
    }
  >();
  for (const row of rows) {
    const key = `${row.property_id}:${row.device_id}`;
    const item = grouped.get(key) ?? {
      propertyId: String(row.property_id),
      deviceId: String(row.device_id),
      ports: [],
    };
    item.ports.push(rowToPort(row));
    grouped.set(key, item);
  }
  return [...grouped.values()];
}

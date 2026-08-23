/**
 * HLK-LD2410C BLE クライアント
 * Service: 0000ffe0 / Characteristic: 0000ffe1
 * プロトコル: LD2410C Serial Communication Protocol V1.07
 */

export const LD2410_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
export const LD2410_CHAR_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";

const FRAME_HEAD = [0xfd, 0xfc, 0xfb, 0xfa];
const FRAME_TAIL = [0x04, 0x03, 0x02, 0x01];
const REPORT_HEAD = [0xf4, 0xf3, 0xf2, 0xf1];

/** Gate N の概算距離 (m) — 0.75m 解像度 */
export function gateToDistanceM(gate) {
  const g = Number(gate);
  if (!Number.isFinite(g) || g <= 0) return 0;
  return g * 0.75;
}

/** 距離 (m) → 表示用ゲート番号 */
export function distanceMToGate(m) {
  const d = Number(m);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.min(8, Math.max(0, Math.round(d / 0.75)));
}

function u16le(n) {
  return [n & 0xff, (n >> 8) & 0xff];
}

function u32le(n) {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}

function buildFrame(cmdWord, valueBytes = []) {
  const inner = [...u16le(cmdWord), ...valueBytes];
  const len = u16le(inner.length);
  return new Uint8Array([...FRAME_HEAD, ...len, ...inner, ...FRAME_TAIL]);
}

export const CMD = {
  CONFIG_ENABLE: 0x00ff,
  CONFIG_DISABLE: 0x00fe,
  PARAMS_WRITE: 0x0060,
  PARAMS_READ: 0x0061,
  GATE_SENSITIVITY: 0x0064,
};

/** 設定モード有効化 FD FC FB FA 04 00 FF 00 01 00 04 03 02 01 */
export function cmdEnableConfig() {
  return buildFrame(CMD.CONFIG_ENABLE, [...u16le(0x0001)]);
}

/** 設定モード終了（Flash保存） FD FC FB FA 02 00 FE 00 04 03 02 01 */
export function cmdDisableConfig() {
  return buildFrame(CMD.CONFIG_DISABLE);
}

/** パラメータ読み取り */
export function cmdReadParams() {
  return buildFrame(CMD.PARAMS_READ);
}

/**
 * 最大距離ゲート・無人遅延設定 (0x0060)
 * @param {number} maxGate 最大検知ゲート (0-8, プロトコル上は 1-8)
 * @param {number} noneDurationSec 無人遅延 (秒)
 */
export function cmdWriteParams(maxGate, noneDurationSec) {
  const gate = Math.min(8, Math.max(1, Number(maxGate) || 1));
  const dur = Math.min(65535, Math.max(0, Number(noneDurationSec) || 0));
  return buildFrame(CMD.PARAMS_WRITE, [
    ...u16le(0x0000),
    ...u32le(gate),
    ...u16le(0x0001),
    ...u32le(gate),
    ...u16le(0x0002),
    ...u32le(dur),
  ]);
}

/**
 * 全ゲート一括感度設定 (0x0064) — distance gate 0xFFFF
 * @param {number} motionSens 動体感度 0-100
 * @param {number} staticSens 静止感度 0-100
 */
export function cmdWriteSensitivity(motionSens, staticSens) {
  const m = Math.min(100, Math.max(0, Number(motionSens) || 0));
  const s = Math.min(100, Math.max(0, Number(staticSens) || 0));
  return buildFrame(CMD.GATE_SENSITIVITY, [
    ...u16le(0x0000),
    ...u32le(0xffff),
    ...u16le(0x0001),
    ...u32le(m),
    ...u16le(0x0002),
    ...u32le(s),
  ]);
}

function readU16le(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8);
}

/** ACK フレーム解析 — 成功なら true */
export function parseAckFrame(data) {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (buf.length < 12) return { ok: false, cmd: 0 };
  for (let i = 0; i < 4; i++) {
    if (buf[i] !== FRAME_HEAD[i]) return { ok: false, cmd: 0 };
  }
  const dataLen = readU16le(buf, 4);
  const ackCmd = readU16le(buf, 6);
  const status = readU16le(buf, 8);
  return { ok: status === 0, cmd: ackCmd, dataLen, raw: buf };
}

/**
 * 0x61 読み取り応答からパラメータ抽出
 * ACK: status + 0xAA + maxGateN + motionMax + staticMax + sens[0..N] + staticSens[0..N] + duration(2)
 */
export function parseParamsReadAck(buf) {
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const ack = parseAckFrame(data);
  if (!ack.ok) return null;

  let offset = 10;
  if (data[offset] !== 0xaa) return null;
  offset += 1;

  const maxGateN = data[offset++];
  const motionMaxGate = data[offset++];
  const staticMaxGate = data[offset++];

  const motionSens = [];
  const staticSens = [];
  for (let i = 0; i <= maxGateN; i++) {
    motionSens.push(data[offset++]);
  }
  for (let i = 0; i <= maxGateN; i++) {
    staticSens.push(data[offset++]);
  }
  const noneDuration = readU16le(data, offset);

  const avgMotion =
    motionSens.length > 0
      ? Math.round(motionSens.reduce((a, b) => a + b, 0) / motionSens.length)
      : 50;
  const avgStatic =
    staticSens.length > 0
      ? Math.round(staticSens.reduce((a, b) => a + b, 0) / staticSens.length)
      : 50;

  return {
    maxGateN,
    motionMaxGate,
    staticMaxGate,
    motionSens,
    staticSens,
    noneDuration,
    motionSensitivity: avgMotion,
    staticSensitivity: avgStatic,
  };
}

/**
 * レポートデータ (F4 F3 F2 F1) からターゲット距離を抽出
 * 基本情報: status(1) + movingDist(2cm) + movingEnergy(1) + staticDist(2cm) + staticEnergy(1) + detectDist(2cm)
 */
export function parseTargetReport(buf) {
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (data.length < 13) return null;
  for (let i = 0; i < 4; i++) {
    if (data[i] !== REPORT_HEAD[i]) return null;
  }

  const dataLen = readU16le(data, 4);
  let offset = 6;
  const end = 6 + dataLen;
  let best = null;

  while (offset < end - 4) {
    const dataType = data[offset++];
    if (dataType !== 0x02) {
      offset += Math.max(0, end - offset - 4);
      continue;
    }
    if (data[offset] !== 0xaa) break;
    offset += 1;

    const status = data[offset++];
    const movingDistCm = readU16le(data, offset);
    offset += 2;
    const movingEnergy = data[offset++];
    const staticDistCm = readU16le(data, offset);
    offset += 2;
    const staticEnergy = data[offset++];
    const detectDistCm = readU16le(data, offset);
    offset += 2;

    const distCm = detectDistCm || movingDistCm || staticDistCm;
    best = {
      status,
      movingDistM: movingDistCm / 100,
      staticDistM: staticDistCm / 100,
      detectDistM: detectDistCm / 100,
      distanceM: distCm / 100,
      movingEnergy,
      staticEnergy,
      hasTarget: status !== 0x00,
    };
    break;
  }
  return best;
}

/** Web Bluetooth / Capacitor BLE 対応可否 */
export function detectBleCapability() {
  if (typeof navigator !== "undefined" && navigator.bluetooth) {
    return { supported: true, transport: "web", label: "Web Bluetooth" };
  }
  const cap = typeof window !== "undefined" && window.Capacitor;
  if (cap?.Plugins?.BluetoothLe) {
    return { supported: true, transport: "capacitor", label: "Capacitor BLE" };
  }
  return {
    supported: false,
    transport: "none",
    label: "非対応",
    reason: isIosSafari()
      ? "iOS Safari は Web Bluetooth 非対応です。Android Chrome または TiSLY ネイティブアプリをご利用ください。"
      : "このブラウザは Bluetooth 接続に対応していません。Chrome（Android/PC）または TiSLY アプリをご利用ください。",
  };
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}

/** 応答待ち — ACK またはタイムアウト */
function waitForResponse(readQueue, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      readQueue.pending = null;
      reject(new Error("BLE 応答タイムアウト"));
    }, timeoutMs);

    readQueue.pending = (data) => {
      clearTimeout(timer);
      readQueue.pending = null;
      resolve(data);
    };
  });
}

/**
 * LD2410C 単体接続セッション
 */
export class Ld2410Session {
  constructor(device, transport = "web") {
    this.device = device;
    this.transport = transport;
    this.server = null;
    this.characteristic = null;
    this.readQueue = { pending: null, buffer: [] };
    this.onTargetReport = null;
    this._notifyHandler = null;
  }

  get name() {
    return this.device?.name || this.device?.id || "LD2410C";
  }

  async connect() {
    if (this.transport === "web") {
      await this._connectWeb();
    } else {
      await this._connectCapacitor();
    }
  }

  async _connectWeb() {
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(LD2410_SERVICE_UUID);
    const char = await service.getCharacteristic(LD2410_CHAR_UUID);
    this.server = server;
    this.characteristic = char;

    this._notifyHandler = (event) => {
      const value = event.target.value;
      const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      this._handleIncoming(data);
    };
    char.addEventListener("characteristicvaluechanged", this._notifyHandler);
    await char.startNotifications();
  }

  async _connectCapacitor() {
    const Ble = window.Capacitor.Plugins.BluetoothLe;
    const deviceId = this.device.deviceId || this.device.id;
    await Ble.connect({ deviceId });
    await Ble.startNotifications({
      deviceId,
      service: LD2410_SERVICE_UUID,
      characteristic: LD2410_CHAR_UUID,
    });
    Ble.addListener("onCharacteristicChanged", (ev) => {
      if (ev.deviceId !== deviceId) return;
      const raw = ev.value;
      const data =
        raw instanceof Uint8Array
          ? raw
          : new Uint8Array(atob(raw).split("").map((c) => c.charCodeAt(0)));
      this._handleIncoming(data);
    });
    this.characteristic = { deviceId };
  }

  _handleIncoming(data) {
    if (data[0] === 0xf4) {
      const report = parseTargetReport(data);
      if (report && this.onTargetReport) this.onTargetReport(report);
      return;
    }
    if (this.readQueue.pending) {
      this.readQueue.pending(data);
    } else {
      this.readQueue.buffer.push(data);
    }
  }

  async write(cmdBytes) {
    const buf = cmdBytes instanceof Uint8Array ? cmdBytes : new Uint8Array(cmdBytes);
    if (this.transport === "web") {
      await this.characteristic.writeValue(buf);
    } else {
      const Ble = window.Capacitor.Plugins.BluetoothLe;
      let binary = "";
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      await Ble.write({
        deviceId: this.characteristic.deviceId,
        service: LD2410_SERVICE_UUID,
        characteristic: LD2410_CHAR_UUID,
        value: btoa(binary),
      });
    }
  }

  async sendAndWait(cmdBytes) {
    const promise = waitForResponse(this.readQueue);
    await this.write(cmdBytes);
    return promise;
  }

  async enableConfig() {
    const resp = await this.sendAndWait(cmdEnableConfig());
    return parseAckFrame(resp).ok;
  }

  async disableConfig() {
    const resp = await this.sendAndWait(cmdDisableConfig());
    return parseAckFrame(resp).ok;
  }

  async readParams() {
    await this.enableConfig();
    const resp = await this.sendAndWait(cmdReadParams());
    const params = parseParamsReadAck(resp);
    await this.disableConfig();
    return params;
  }

  async saveSettings({ maxGate, motionSens, staticSens, noneDuration }) {
    await this.enableConfig();
    await this.sendAndWait(cmdWriteParams(maxGate, noneDuration));
    await this.sendAndWait(cmdWriteSensitivity(motionSens, staticSens));
    const ok = await this.disableConfig();
    return ok;
  }

  async disconnect() {
    try {
      if (this.transport === "web" && this.characteristic) {
        this.characteristic.removeEventListener(
          "characteristicvaluechanged",
          this._notifyHandler
        );
        try {
          await this.characteristic.stopNotifications();
        } catch {
          /* ignore */
        }
      }
      if (this.transport === "web" && this.device?.gatt?.connected) {
        this.device.gatt.disconnect();
      }
      if (this.transport === "capacitor" && window.Capacitor?.Plugins?.BluetoothLe) {
        const id = this.characteristic?.deviceId || this.device?.deviceId;
        if (id) await window.Capacitor.Plugins.BluetoothLe.disconnect({ deviceId: id });
      }
    } catch {
      /* ignore disconnect errors */
    }
    this.server = null;
    this.characteristic = null;
  }
}

/**
 * BLE スキャン・デバイス発見
 */
export class RadarBleScanner {
  constructor() {
    this.discovered = new Map();
    this.onDeviceFound = null;
    this._scanActive = false;
    this._scanCtrl = null;
    this.capability = detectBleCapability();
  }

  async scanOnce() {
    if (!this.capability.supported) {
      throw new Error(this.capability.reason || "BLE 非対応");
    }

    if (this.capability.transport === "web") {
      return await this._scanWebRequestDevice();
    }
    return await this._scanCapacitor();
  }

  async startPassiveScan() {
    if (!navigator.bluetooth?.requestLEScan) return false;
    try {
      this._scanCtrl = await navigator.bluetooth.requestLEScan({
        filters: [{ services: [LD2410_SERVICE_UUID] }],
        keepRepeatedDevices: true,
      });
      this._scanActive = true;
      navigator.bluetooth.addEventListener("advertisementreceived", (ev) => {
        const entry = {
          id: ev.device.id,
          name: ev.device.name || "HLK-LD2410C",
          rssi: ev.rssi,
          device: ev.device,
          transport: "web",
        };
        this.discovered.set(entry.id, entry);
        if (this.onDeviceFound) this.onDeviceFound(entry);
      });
      return true;
    } catch {
      return false;
    }
  }

  stopPassiveScan() {
    if (this._scanCtrl) {
      this._scanCtrl.stop();
      this._scanCtrl = null;
    }
    this._scanActive = false;
  }

  async _scanWebRequestDevice() {
    const filters = [
      { namePrefix: "HLK" },
      { namePrefix: "LD2410" },
      { services: [LD2410_SERVICE_UUID] },
    ];
    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters,
        optionalServices: [LD2410_SERVICE_UUID],
      });
    } catch {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [LD2410_SERVICE_UUID],
      });
    }

    let rssi = null;
    if (device.watchAdvertisements) {
      try {
        await device.watchAdvertisements();
        const rssiPromise = new Promise((resolve) => {
          const handler = (ev) => {
            device.removeEventListener("advertisementreceived", handler);
            resolve(ev.rssi);
          };
          device.addEventListener("advertisementreceived", handler);
          setTimeout(() => {
            device.removeEventListener("advertisementreceived", handler);
            resolve(null);
          }, 2000);
        });
        rssi = await rssiPromise;
      } catch {
        /* RSSI unavailable */
      }
    }

    const entry = {
      id: device.id,
      name: device.name || "HLK-LD2410C",
      rssi,
      device,
      transport: "web",
    };
    this.discovered.set(entry.id, entry);
    if (this.onDeviceFound) this.onDeviceFound(entry);
    return entry;
  }

  async _scanCapacitor() {
    const Ble = window.Capacitor.Plugins.BluetoothLe;
    await Ble.initialize();
    const result = await Ble.requestDevice({
      services: [LD2410_SERVICE_UUID],
      namePrefix: "HLK",
    });
    const entry = {
      id: result.deviceId,
      name: result.name || "HLK-LD2410C",
      rssi: result.rssi ?? null,
      device: result,
      transport: "capacitor",
    };
    this.discovered.set(entry.id, entry);
    if (this.onDeviceFound) this.onDeviceFound(entry);
    return entry;
  }

  async loadAuthorizedDevices() {
    if (!navigator.bluetooth?.getDevices) return [];
    const devices = await navigator.bluetooth.getDevices();
    const entries = [];
    for (const device of devices) {
      const entry = {
        id: device.id,
        name: device.name || "HLK-LD2410C",
        rssi: null,
        device,
        transport: "web",
      };
      this.discovered.set(entry.id, entry);
      entries.push(entry);
      if (this.onDeviceFound) this.onDeviceFound(entry);
    }
    return entries;
  }
}

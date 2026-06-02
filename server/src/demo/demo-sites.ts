/** Phase 61–80: 仮想現場・ゾーン定義（営業デモ用固定データ） */

export interface DemoSite {
  id: string;
  name: string;
  type: "residential" | "factory" | "warehouse" | "hotel" | "automotive";
  lat: number;
  lng: number;
  address: string;
}

export interface DemoZone {
  id: string;
  name: string;
  siteIds: string[];
}

export const DEMO_SITES: DemoSite[] = [
  {
    id: "site-moriya",
    name: "守谷住宅",
    type: "residential",
    lat: 35.95,
    lng: 140.05,
    address: "茨城県守谷市（デモ）",
  },
  {
    id: "site-factory-a",
    name: "工場A",
    type: "factory",
    lat: 35.68,
    lng: 139.77,
    address: "東京都（デモ工場）",
  },
  {
    id: "site-warehouse-a",
    name: "倉庫A",
    type: "warehouse",
    lat: 35.62,
    lng: 139.75,
    address: "神奈川県（デモ倉庫）",
  },
  {
    id: "site-minpaku-a",
    name: "民泊A",
    type: "hotel",
    lat: 35.66,
    lng: 139.7,
    address: "東京都渋谷区（デモ民泊）",
  },
  {
    id: "site-garage-a",
    name: "車屋A",
    type: "automotive",
    lat: 35.58,
    lng: 139.73,
    address: "神奈川県横浜市（デモ車屋）",
  },
];

export const DEMO_ZONES: DemoZone[] = [
  { id: "zone-perimeter", name: "外周", siteIds: DEMO_SITES.map((s) => s.id) },
  { id: "zone-parking", name: "駐車場", siteIds: ["site-moriya", "site-factory-a", "site-garage-a"] },
  { id: "zone-entrance", name: "玄関", siteIds: ["site-moriya", "site-minpaku-a", "site-garage-a"] },
  { id: "zone-1f", name: "1F", siteIds: ["site-moriya", "site-minpaku-a", "site-garage-a"] },
  { id: "zone-2f", name: "2F", siteIds: ["site-moriya", "site-minpaku-a"] },
  { id: "zone-warehouse", name: "倉庫", siteIds: ["site-warehouse-a", "site-factory-a"] },
  { id: "zone-factory", name: "工場", siteIds: ["site-factory-a"] },
];

export type DemoDeviceKind =
  | "esp32"
  | "rp2350"
  | "plc"
  | "camera"
  | "door"
  | "sensor"
  | "alarm";

export interface DemoDeviceTemplate {
  kind: DemoDeviceKind;
  suffix: string;
  labelPrefix: string;
  platform: string;
}

export const DEVICE_TEMPLATES: DemoDeviceTemplate[] = [
  { kind: "esp32", suffix: "esp", labelPrefix: "ESP", platform: "esp-idf" },
  { kind: "rp2350", suffix: "rp", labelPrefix: "RP2350", platform: "rp2350" },
  { kind: "plc", suffix: "plc", labelPrefix: "PLC FX", platform: "mitsubishi-fx" },
  { kind: "camera", suffix: "cam", labelPrefix: "Camera", platform: "onvif" },
  { kind: "door", suffix: "door", labelPrefix: "Door", platform: "zigbee" },
  { kind: "sensor", suffix: "sns", labelPrefix: "Sensor", platform: "modbus" },
  { kind: "alarm", suffix: "alm", labelPrefix: "Alarm", platform: "siren" },
];

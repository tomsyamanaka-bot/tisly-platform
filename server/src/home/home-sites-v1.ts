/**
 * TiSLY HOME — 住設・ホームIoT統合
 * 物件カタログ v1（JP / AU · tenant_id）
 *
 * 統合する4大デバイス
 *  1. 分電盤用CT（電力・デマンド監視）
 *  2. 風呂リモコン（給湯・湯はり制御）
 *  3. エアコン（空調制御）
 *  4. 玄関スマートロック（電子錠）
 *
 * 既存配列は削除・改変せず末尾追記のみ。
 */

export type HomeCountryCodeV1 = "JP" | "AU";
export type HomeCurrencyV1 = "JPY" | "AUD";

/** SaaS 月額契約ステータス */
export type HomePlanStatusV1 = "active" | "trial" | "suspended";

/** 物件種別 */
export type HomeSiteKindV1 = "model_house" | "detached" | "demo_house";

/** 制御チャンネル（実機ハック方式） */
export type HomeControlChannelV1 =
  | "rp2350_ct" // CTクランプ + RP2350 AI入力
  | "rp2350_relay" // RP2350 リレー出力
  | "jema_ha" // JEMA/HA端子（給湯・エコキュート）
  | "ir_bridge" // 学習リモコン（赤外線）
  | "nfc_lock" // NFC/RFID 電子錠
  | "intercom_sip"; // スマートインターホン（SIP/RTSP）

/** 分岐回路 */
export interface HomeCircuitV1 {
  id: string;
  label: string;
  /** 100V / 200V / 240V(AU) */
  voltage: 100 | 200 | 240;
  currentA: number;
  /** 通電中 */
  on: boolean;
  /** ピークカット制御の対象か */
  peakCutTarget: boolean;
}

/** 分電盤用CT（電力・デマンド監視） */
export interface HomeCtPanelV1 {
  deviceKey: string;
  label: string;
  controlChannel: HomeControlChannelV1;
  /** 主幹電流 A */
  mainCurrentA: number;
  /** 主幹ブレーカ容量 A */
  mainCapacityA: number;
  /** 現在消費電力 W */
  powerW: number;
  /** 契約デマンド kW */
  contractDemandKw: number;
  /** 過負荷警告しきい値 A */
  warnThresholdA: number;
  /** 過負荷アラートしきい値 A */
  alertThresholdA: number;
  /** ピークカット連動 作動中 */
  peakCutActive: boolean;
  /** 太陽光発電 W（AU Solar / 無い場合 0） */
  solarGenerationW: number;
  circuits: HomeCircuitV1[];
  /** 当日時間別 主幹電流 A（24点） */
  hourlyCurrentA: number[];
}

/** 湯はり状態 */
export type HomeBathFillStateV1 = "idle" | "filling" | "done";

/** 風呂リモコン（給湯・湯はり制御） */
export interface HomeBathRemoteV1 {
  deviceKey: string;
  label: string;
  controlChannel: HomeControlChannelV1;
  /** 給湯設定温度 ℃ */
  setTempC: number;
  /** 現在浴槽温度 ℃ */
  currentTempC: number;
  fillState: HomeBathFillStateV1;
  /** 湯はり進捗 % */
  fillPercent: number;
  /** 自動お湯はり ON */
  autoFill: boolean;
  /** 追いだき中 */
  reheating: boolean;
  /** ふろ保温 ON */
  keepWarm: boolean;
  /** HA端子（JEMA）名称 */
  jemaTerminal: string;
  /** RP2350 リレー出力ポート */
  relayPort: string;
  /** 端子連携状態 */
  linkState: "connected" | "standby" | "offline";
}

export type HomeAirconModeV1 = "cool" | "heat" | "dry" | "fan";
export type HomeAirconFanV1 = "auto" | "low" | "mid" | "high";
export type HomeAirconSwingV1 = "auto" | "up" | "middle" | "down";

/** エアコン（空調制御） */
export interface HomeAirconV1 {
  deviceKey: string;
  label: string;
  controlChannel: HomeControlChannelV1;
  power: boolean;
  /** 室温 ℃ */
  roomTempC: number;
  /** 設定温度 ℃ */
  setTempC: number;
  mode: HomeAirconModeV1;
  fan: HomeAirconFanV1;
  swing: HomeAirconSwingV1;
  /** 消費電力 W */
  powerW: number;
  /** ピーク時自動セーブ運転 */
  peakSaveActive: boolean;
}

export type HomeCredentialTypeV1 = "nfc" | "rfid" | "pin" | "app" | "key";

/** 入退室ログ 1件 */
export interface HomeAccessEntryV1 {
  id: string;
  credentialType: HomeCredentialTypeV1;
  holderName: string;
  action: "unlock" | "lock";
  occurredAt: string;
}

/** 玄関スマートロック（電子錠・入退室） */
export interface HomeSmartLockV1 {
  deviceKey: string;
  label: string;
  controlChannel: HomeControlChannelV1;
  /** true = LOCKED 🔒 */
  locked: boolean;
  /** ドア開閉センサー true = 開 */
  doorOpen: boolean;
  /** 電池残量 % */
  batteryPercent: number;
  /** 直近の解錠者ログ（新しい順） */
  accessLog: HomeAccessEntryV1[];
}

/** インターホンの状態 */
export type HomeIntercomStateV1 =
  | "idle" // 待機中
  | "ringing" // 呼出中
  | "talking" // 通話中
  | "auto_responded"; // 自動応答済み

/** 映像取得方式（実機は RTSP / WebRTC、未接続はモック枠） */
export type HomeIntercomStreamKindV1 = "rtsp" | "webrtc" | "mock";

/** 来客 1 件 */
export interface HomeIntercomVisitorV1 {
  id: string;
  /** 来客の種別ラベル（宅配・来訪者 等） */
  label: string;
  occurredAt: string;
  /** どう対応したか */
  handledAs: "answered" | "auto" | "unlocked" | "missed";
}

/** スマートインターホン（呼出・カメラ・応答） */
export interface HomeIntercomV1 {
  deviceKey: string;
  label: string;
  controlChannel: HomeControlChannelV1;
  state: HomeIntercomStateV1;
  /** 直近の来客時刻（ISO / 未訪問は null） */
  lastVisitAt: string | null;
  /** 映像方式 */
  streamKind: HomeIntercomStreamKindV1;
  /** ライブ映像 URL（未接続は空） */
  streamUrl: string;
  /** スナップショット画像 URL（未接続は空） */
  snapshotUrl: string;
  /** 自動応答で流す音声メッセージ */
  autoResponseMessage: string;
  /** 呼出時に玄関錠の解錠を許可するか */
  unlockLinkEnabled: boolean;
  /** 来客履歴（新しい順） */
  visitors: HomeIntercomVisitorV1[];
}

/** 住設統合物件 */
export interface HomeSiteV1 {
  id: string;
  tenantId: string;
  customerCode: string;
  countryCode: HomeCountryCodeV1;
  currency: HomeCurrencyV1;
  kind: HomeSiteKindV1;
  displayName: string;
  addressLabel: string;
  /** 電圧仕様（JP 100V-200V / AU 240V） */
  voltageSpec: string;
  /** 給湯方式（エコキュート / Heat pump 等） */
  hotWaterSpec: string;
  /** SaaS プランコード */
  planCode: string;
  planStatus: HomePlanStatusV1;
  /** 月額（currency 建て） */
  monthlyFee: number;
  ct: HomeCtPanelV1;
  bath: HomeBathRemoteV1;
  aircons: HomeAirconV1[];
  lock: HomeSmartLockV1;
  intercom: HomeIntercomV1;
  notes: string[];
}

export const HOME_DEFAULT_SITE_ID_V1 = "HOME-JP-TSUKUBA-001";

/**
 * TiSLY HOME 物件モックデータ
 * JP: つくばモデルハウス（100V-200V / エコキュート）
 * AU: Gold Coast Demo House（240V / Solar+CT）
 */
export const HOME_SITES_V1: HomeSiteV1[] = [
  {
    id: "HOME-JP-TSUKUBA-001",
    tenantId: "tenant_toms_jp",
    customerCode: "TOMS001",
    countryCode: "JP",
    currency: "JPY",
    kind: "model_house",
    displayName: "つくばモデルハウス",
    addressLabel: "茨城県つくば市",
    voltageSpec: "単相3線 100V / 200V",
    hotWaterSpec: "エコキュート（JEMA / HA端子）",
    planCode: "home_standard",
    planStatus: "active",
    monthlyFee: 3800,
    ct: {
      deviceKey: "ct-main",
      label: "分電盤 主幹CT",
      controlChannel: "rp2350_ct",
      mainCurrentA: 31.2,
      mainCapacityA: 60,
      powerW: 5340,
      contractDemandKw: 6,
      warnThresholdA: 45,
      alertThresholdA: 54,
      peakCutActive: false,
      solarGenerationW: 0,
      circuits: [
        {
          id: "c1",
          label: "エアコン（リビング）",
          voltage: 200,
          currentA: 12.4,
          on: true,
          peakCutTarget: true,
        },
        {
          id: "c2",
          label: "エコキュート",
          voltage: 200,
          currentA: 9.8,
          on: true,
          peakCutTarget: true,
        },
        {
          id: "c3",
          label: "IHクッキングヒーター",
          voltage: 200,
          currentA: 0,
          on: false,
          peakCutTarget: true,
        },
        {
          id: "c4",
          label: "一般負荷（照明・コンセント）",
          voltage: 100,
          currentA: 8.6,
          on: true,
          peakCutTarget: false,
        },
        {
          id: "c5",
          label: "給湯リモコン・制御盤",
          voltage: 100,
          currentA: 0.4,
          on: true,
          peakCutTarget: false,
        },
      ],
      hourlyCurrentA: [
        14, 13, 12, 12, 13, 18, 28, 36, 32, 26, 22, 20, 21, 19, 18,
        22, 28, 38, 42, 40, 34, 26, 20, 16,
      ],
    },
    bath: {
      deviceKey: "bath-remote",
      label: "浴室リモコン（エコキュート）",
      controlChannel: "jema_ha",
      setTempC: 42,
      currentTempC: 41.2,
      fillState: "filling",
      fillPercent: 62,
      autoFill: true,
      reheating: false,
      keepWarm: true,
      jemaTerminal: "HA端子1（JEMA 制御）",
      relayPort: "RO3",
      linkState: "connected",
    },
    aircons: [
      {
        deviceKey: "ac-living",
        label: "リビング エアコン",
        controlChannel: "ir_bridge",
        power: true,
        roomTempC: 27.8,
        setTempC: 26,
        mode: "cool",
        fan: "auto",
        swing: "auto",
        powerW: 780,
        peakSaveActive: false,
      },
      {
        deviceKey: "ac-bedroom",
        label: "寝室 エアコン",
        controlChannel: "ir_bridge",
        power: false,
        roomTempC: 28.4,
        setTempC: 27,
        mode: "cool",
        fan: "low",
        swing: "middle",
        powerW: 0,
        peakSaveActive: false,
      },
    ],
    lock: {
      deviceKey: "lock-entrance",
      label: "玄関 スマートロック",
      controlChannel: "nfc_lock",
      locked: true,
      doorOpen: false,
      batteryPercent: 86,
      accessLog: [
        {
          id: "acc-jp-1",
          credentialType: "nfc",
          holderName: "山田 太郎",
          action: "unlock",
          occurredAt: "2026-08-16T08:12:00+09:00",
        },
        {
          id: "acc-jp-2",
          credentialType: "app",
          holderName: "TOMS 保守",
          action: "lock",
          occurredAt: "2026-08-15T18:40:00+09:00",
        },
        {
          id: "acc-jp-3",
          credentialType: "rfid",
          holderName: "山田 花子",
          action: "unlock",
          occurredAt: "2026-08-15T16:05:00+09:00",
        },
      ],
    },
    intercom: {
      deviceKey: "intercom-entrance",
      label: "玄関 スマートインターホン",
      controlChannel: "intercom_sip",
      state: "idle",
      lastVisitAt: "2026-08-16T14:20:00+09:00",
      streamKind: "mock",
      streamUrl: "",
      snapshotUrl: "",
      autoResponseMessage:
        "ただいま手が離せません。置き配でお願いします。",
      unlockLinkEnabled: true,
      visitors: [
        {
          id: "vis-jp-1",
          label: "宅配便（置き配）",
          occurredAt: "2026-08-16T14:20:00+09:00",
          handledAs: "auto",
        },
        {
          id: "vis-jp-2",
          label: "来訪者",
          occurredAt: "2026-08-15T11:05:00+09:00",
          handledAs: "answered",
        },
      ],
    },
    notes: [
      "主幹電流は契約内で安定しています",
      "自動お湯はりを実行中です",
    ],
  },
  {
    id: "HOME-JP-MORIYA-ALERT",
    tenantId: "tenant_toms_jp",
    customerCode: "TOMS001",
    countryCode: "JP",
    currency: "JPY",
    kind: "detached",
    displayName: "守谷 デモ邸（警報デモ）",
    addressLabel: "茨城県守谷市",
    voltageSpec: "単相3線 100V / 200V",
    hotWaterSpec: "エコキュート（JEMA / HA端子）",
    planCode: "home_basic",
    planStatus: "trial",
    monthlyFee: 1980,
    ct: {
      deviceKey: "ct-main",
      label: "分電盤 主幹CT",
      controlChannel: "rp2350_ct",
      mainCurrentA: 56.8,
      mainCapacityA: 60,
      powerW: 9960,
      contractDemandKw: 6,
      warnThresholdA: 45,
      alertThresholdA: 54,
      peakCutActive: true,
      solarGenerationW: 0,
      circuits: [
        {
          id: "c1",
          label: "エアコン（リビング）",
          voltage: 200,
          currentA: 0,
          on: false,
          peakCutTarget: true,
        },
        {
          id: "c2",
          label: "エコキュート",
          voltage: 200,
          currentA: 18.2,
          on: true,
          peakCutTarget: true,
        },
        {
          id: "c3",
          label: "IHクッキングヒーター",
          voltage: 200,
          currentA: 24.6,
          on: true,
          peakCutTarget: true,
        },
        {
          id: "c4",
          label: "一般負荷（照明・コンセント）",
          voltage: 100,
          currentA: 14.0,
          on: true,
          peakCutTarget: false,
        },
      ],
      hourlyCurrentA: [
        16, 15, 14, 14, 16, 22, 34, 44, 38, 30, 26, 28, 34, 30, 28,
        32, 40, 52, 57, 54, 44, 32, 24, 18,
      ],
    },
    bath: {
      deviceKey: "bath-remote",
      label: "浴室リモコン（エコキュート）",
      controlChannel: "jema_ha",
      setTempC: 41,
      currentTempC: 38.6,
      fillState: "idle",
      fillPercent: 0,
      autoFill: false,
      reheating: true,
      keepWarm: false,
      jemaTerminal: "HA端子1（JEMA 制御）",
      relayPort: "RO3",
      linkState: "connected",
    },
    aircons: [
      {
        deviceKey: "ac-living",
        label: "リビング エアコン",
        controlChannel: "ir_bridge",
        power: false,
        roomTempC: 30.2,
        setTempC: 26,
        mode: "cool",
        fan: "auto",
        swing: "auto",
        powerW: 0,
        peakSaveActive: true,
      },
    ],
    lock: {
      deviceKey: "lock-entrance",
      label: "玄関 スマートロック",
      controlChannel: "nfc_lock",
      locked: false,
      doorOpen: true,
      batteryPercent: 42,
      accessLog: [
        {
          id: "acc-al-1",
          credentialType: "nfc",
          holderName: "佐藤 一郎",
          action: "unlock",
          occurredAt: "2026-08-16T09:02:00+09:00",
        },
        {
          id: "acc-al-2",
          credentialType: "pin",
          holderName: "配送業者",
          action: "unlock",
          occurredAt: "2026-08-16T07:31:00+09:00",
        },
      ],
    },
    intercom: {
      deviceKey: "intercom-entrance",
      label: "玄関 スマートインターホン",
      controlChannel: "intercom_sip",
      state: "ringing",
      lastVisitAt: "2026-08-16T14:20:00+09:00",
      streamKind: "mock",
      streamUrl: "",
      snapshotUrl: "",
      autoResponseMessage:
        "ただいま手が離せません。置き配でお願いします。",
      unlockLinkEnabled: true,
      visitors: [
        {
          id: "vis-al-1",
          label: "来訪者（応答待ち）",
          occurredAt: "2026-08-16T14:20:00+09:00",
          handledAs: "missed",
        },
      ],
    },
    notes: [
      "主幹電流が警告しきい値を超えています",
      "ピークカットでエアコンを一時停止しました",
      "玄関が解錠・開放されています",
    ],
  },
  // AU 展開サンプル（追記 — 既存物件は変更しない）
  {
    id: "HOME-AU-GOLDCOAST-001",
    tenantId: "tenant_demo_au",
    customerCode: "AUDEMO01",
    countryCode: "AU",
    currency: "AUD",
    kind: "demo_house",
    displayName: "Gold Coast Demo House",
    addressLabel: "QLD, Australia",
    voltageSpec: "Single phase 240V",
    hotWaterSpec: "Heat pump hot water (relay control)",
    planCode: "home_solar",
    planStatus: "active",
    monthlyFee: 39,
    ct: {
      deviceKey: "ct-main",
      label: "Switchboard main CT",
      controlChannel: "rp2350_ct",
      mainCurrentA: 31.2,
      mainCapacityA: 63,
      powerW: 7488,
      contractDemandKw: 10,
      warnThresholdA: 48,
      alertThresholdA: 57,
      peakCutActive: false,
      solarGenerationW: 4200,
      circuits: [
        {
          id: "c1",
          label: "Ducted air conditioning (240V)",
          voltage: 240,
          currentA: 11.8,
          on: true,
          peakCutTarget: true,
        },
        {
          id: "c2",
          label: "Heat pump hot water (240V)",
          voltage: 240,
          currentA: 8.4,
          on: true,
          peakCutTarget: true,
        },
        {
          id: "c3",
          label: "EV charger (240V)",
          voltage: 240,
          currentA: 0,
          on: false,
          peakCutTarget: true,
        },
        {
          id: "c4",
          label: "Pool pump (240V)",
          voltage: 240,
          currentA: 4.8,
          on: true,
          peakCutTarget: true,
        },
        {
          id: "c5",
          label: "General power & lighting",
          voltage: 240,
          currentA: 6.2,
          on: true,
          peakCutTarget: false,
        },
      ],
      hourlyCurrentA: [
        11, 10, 10, 9, 10, 13, 19, 26, 24, 20, 18, 17, 18, 16, 15,
        17, 21, 29, 31, 27, 22, 17, 14, 12,
      ],
    },
    bath: {
      deviceKey: "bath-remote",
      label: "Bathroom remote (heat pump)",
      controlChannel: "rp2350_relay",
      setTempC: 40,
      currentTempC: 39.4,
      fillState: "done",
      fillPercent: 100,
      autoFill: false,
      reheating: false,
      keepWarm: true,
      jemaTerminal: "Dry contact (JEMA equivalent)",
      relayPort: "RO4",
      linkState: "connected",
    },
    aircons: [
      {
        deviceKey: "ac-living",
        label: "Living ducted A/C",
        controlChannel: "ir_bridge",
        power: true,
        roomTempC: 24.6,
        setTempC: 23,
        mode: "cool",
        fan: "mid",
        swing: "auto",
        powerW: 1120,
        peakSaveActive: false,
      },
    ],
    lock: {
      deviceKey: "lock-entrance",
      label: "Front door smart lock",
      controlChannel: "nfc_lock",
      locked: true,
      doorOpen: false,
      batteryPercent: 91,
      accessLog: [
        {
          id: "acc-au-1",
          credentialType: "nfc",
          holderName: "Liam Carter",
          action: "unlock",
          occurredAt: "2026-08-16T07:45:00+10:00",
        },
        {
          id: "acc-au-2",
          credentialType: "app",
          holderName: "TiSLY Support",
          action: "lock",
          occurredAt: "2026-08-15T19:10:00+10:00",
        },
      ],
    },
    intercom: {
      deviceKey: "intercom-entrance",
      label: "Front door smart intercom",
      controlChannel: "intercom_sip",
      state: "idle",
      lastVisitAt: "2026-08-16T09:40:00+10:00",
      streamKind: "mock",
      streamUrl: "",
      snapshotUrl: "",
      autoResponseMessage:
        "We are unavailable right now. Please leave the parcel at the door.",
      unlockLinkEnabled: false,
      visitors: [
        {
          id: "vis-au-1",
          label: "Parcel delivery",
          occurredAt: "2026-08-16T09:40:00+10:00",
          handledAs: "auto",
        },
      ],
    },
    notes: [
      "Solar generation is covering most of the load",
      "Front door is locked",
    ],
  },
];

/** 手動登録・デバイス紐付けで追加されたランタイム物件 */
const RUNTIME_HOME_SITES_V1: HomeSiteV1[] = [];

/** ランタイム物件を末尾追記（既存 ID は上書きしない） */
export function registerRuntimeHomeSiteV1(site: HomeSiteV1): void {
  if (HOME_SITES_V1.some((s) => s.id === site.id)) return;
  const idx = RUNTIME_HOME_SITES_V1.findIndex((s) => s.id === site.id);
  if (idx >= 0) {
    RUNTIME_HOME_SITES_V1[idx] = site;
    return;
  }
  RUNTIME_HOME_SITES_V1.push(site);
}

function allHomeSitesV1(): HomeSiteV1[] {
  return [...HOME_SITES_V1, ...RUNTIME_HOME_SITES_V1];
}

export function findHomeSiteV1(
  id: string | null | undefined
): HomeSiteV1 {
  const key = String(id || "").trim();
  const found = allHomeSitesV1().find((s) => s.id === key);
  if (found) return found;
  return (
    HOME_SITES_V1.find((s) => s.id === HOME_DEFAULT_SITE_ID_V1) ||
    HOME_SITES_V1[0]
  );
}

export function listHomeSitesV1(): HomeSiteV1[] {
  return allHomeSitesV1();
}

/** 主幹負荷率 %（容量に対する現在電流） */
export function homeLoadPercentV1(site: HomeSiteV1): number {
  const cap = site.ct.mainCapacityA;
  if (cap <= 0) return 0;
  const pct = (site.ct.mainCurrentA / cap) * 100;
  return Math.max(0, Math.min(200, Math.round(pct * 10) / 10));
}

export type HomeCtLevelV1 = "normal" | "warning" | "alert";

/** 過負荷しきい値の判定 */
export function homeCtLevelV1(site: HomeSiteV1): HomeCtLevelV1 {
  const a = site.ct.mainCurrentA;
  if (a >= site.ct.alertThresholdA) return "alert";
  if (a >= site.ct.warnThresholdA) return "warning";
  return "normal";
}

/** 防犯要確認（解錠中 or ドア開） */
export function homeSecurityAttentionV1(site: HomeSiteV1): boolean {
  return !site.lock.locked || site.lock.doorOpen;
}

/** 消費電力 kW（小数1桁） */
export function homePowerKwV1(site: HomeSiteV1): number {
  return Math.round((site.ct.powerW / 1000) * 10) / 10;
}

/** 稼働中エアコン台数 */
export function homeActiveAirconCountV1(site: HomeSiteV1): number {
  return site.aircons.filter((a) => a.power).length;
}

/** インターホン呼出中 */
export function homeIntercomRingingV1(site: HomeSiteV1): boolean {
  return site.intercom.state === "ringing";
}

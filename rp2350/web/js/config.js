/** TiSLY RP2350 Edition — Web UI settings */
const TISLY_CONFIG = {
  edition: "RP2350",
  deviceId: "rp2350-home-01",
  mqtt: {
    wsUrl: "ws://192.168.1.10:9001",
    clientId: "tisly-web-" + Math.random().toString(16).slice(2, 8),
    topicPrefix: "tisly/rp2350/rp2350-home-01",
  },
  labels: {
    di: [
      "赤外線ビーム①",
      "赤外線ビーム②",
      "人感①",
      "人感②",
      "窓マグネット①",
      "窓マグネット②",
      "非常停止",
      "予備",
    ],
    relay: [
      "100Vライト①",
      "100Vライト②",
      "パトライト",
      "ブザー",
      "予備",
      "予備",
      "予備",
      "予備",
    ],
  },
  heartbeatWarnSec: 45,
  heartbeatAlarmSec: 90,
};

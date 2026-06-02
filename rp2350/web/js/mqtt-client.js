/** MQTT over WebSocket — TiSLY RP2350 Edition */
(function (global) {
  const state = {
    connected: false,
    di: Array(8).fill(0),
    relay: Array(8).fill(0),
    alarm: false,
    alarmMode: false,
    lastHb: 0,
    events: [],
    listeners: [],
  };

  let client = null;
  const prefix = () => TISLY_CONFIG.mqtt.topicPrefix;

  function emit() {
    state.listeners.forEach((fn) => fn({ ...state }));
  }

  function applyState(obj) {
    if (obj.di && Array.isArray(obj.di)) {
      obj.di.forEach((v, i) => {
        if (i < 8) state.di[i] = v ? 1 : 0;
      });
    }
    if (obj.relay && Array.isArray(obj.relay)) {
      obj.relay.forEach((v, i) => {
        if (i < 8) state.relay[i] = v ? 1 : 0;
      });
    }
    if (typeof obj.alarm_mode === "boolean") state.alarmMode = obj.alarm_mode;
  }

  function onMessage(topic, payload) {
    const p = prefix();
    if (!topic.startsWith(p + "/")) return;
    const rest = topic.slice(p.length + 1);
    const parts = rest.split("/");

    if (parts[0] === "state") {
      try {
        applyState(JSON.parse(payload));
      } catch (_) {}
    } else if (parts[0] === "relay" && parts[2] === "set") {
      const i = parseInt(parts[1], 10) - 1;
      const val = parseInt(String(payload), 10) ? 1 : 0;
      if (i >= 0 && i < 8) state.relay[i] = val;
    } else if (parts[0] === "event") {
      try {
        const ev = JSON.parse(payload);
        state.events.unshift(ev);
        if (state.events.length > 50) state.events.length = 50;
      } catch (_) {
        state.events.unshift({ message: payload });
      }
    } else if (parts[0] === "alarm") {
      try {
        const o = JSON.parse(payload);
        state.alarm = o.active === 1 || o.active === true;
        if (typeof o.alarm_mode === "boolean") state.alarmMode = o.alarm_mode;
      } catch (_) {
        state.alarm = parseInt(String(payload), 10) === 1;
      }
    } else if (parts[0] === "heartbeat") {
      state.lastHb = Date.now();
    }
    emit();
  }

  function connect() {
    if (typeof mqtt === "undefined") {
      console.warn("mqtt.js not loaded — demo mode");
      return;
    }
    const url = localStorage.getItem("tisly_ws_url") || TISLY_CONFIG.mqtt.wsUrl;
    client = mqtt.connect(url, {
      clientId: TISLY_CONFIG.mqtt.clientId,
      clean: true,
      reconnectPeriod: 3000,
    });
    client.on("connect", () => {
      state.connected = true;
      client.subscribe(prefix() + "/#");
      emit();
    });
    client.on("close", () => {
      state.connected = false;
      emit();
    });
    client.on("message", onMessage);
  }

  function subscribe(fn) {
    state.listeners.push(fn);
    fn({ ...state });
  }

  function hbStatus() {
    if (!state.connected) return "offline";
    if (!state.lastHb) return "warn";
    const age = (Date.now() - state.lastHb) / 1000;
    if (age > TISLY_CONFIG.heartbeatAlarmSec) return "alarm";
    if (age > TISLY_CONFIG.heartbeatWarnSec) return "warn";
    return "ok";
  }

  function clearAlarm() {
    if (client && state.connected) {
      client.publish(prefix() + "/cmd/alarm_clear", "clear");
    }
  }

  global.TislyMqtt = { connect, subscribe, hbStatus, clearAlarm, getState: () => state };
})(window);

// TiSLY PLC Builder v5.17 — Google TV Launcher Template
const TV_CONFIG = {
  project: "CARSHOP_NIGHT_SECURITY",
  deviceId: "211",
  mqtt: {
    broker: "mqtt.tisly.local",
    wsPort: 9001,
  },
  topics: {
    state: "tisly/device/211/state",
    alarm: "tisly/device/211/alarm",
    motion: "tisly/device/211/motion",
    output: "tisly/device/211/output",
  },
};

const connEl = document.getElementById("tv-conn");
const clockEl = document.getElementById("tv-clock");

function updateClock() {
  clockEl.textContent = new Date().toLocaleString("ja-JP");
}
setInterval(updateClock, 1000);
updateClock();

function setTvConnection(online) {
  connEl.textContent = online ? "MQTT 接続中" : "デモモード";
  connEl.classList.toggle("online", online);
  connEl.classList.toggle("offline", !online);
}

function focusFirstCard() {
  const first = document.querySelector(".tv-card");
  if (first) first.focus();
}

document.addEventListener("keydown", (e) => {
  const cards = [...document.querySelectorAll(".tv-card")];
  const idx = cards.indexOf(document.activeElement);
  if (e.key === "ArrowRight" && idx >= 0 && idx < cards.length - 1) {
    e.preventDefault();
    cards[idx + 1].focus();
  } else if (e.key === "ArrowLeft" && idx > 0) {
    e.preventDefault();
    cards[idx - 1].focus();
  }
});

setTvConnection(false);
focusFirstCard();
console.info("[TiSLY TV] Configure MQTT WebSocket for live data.");
export { TV_CONFIG };

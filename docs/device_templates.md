# Device Template Library

`GET /api/customer/:code/device-templates`

| ID | 名称 | deviceType |
|----|------|------------|
| esp32-input | ESP32 input unit | ESP32 |
| rp2350-relay | RP2350 relay unit | RP2350 |
| plc-gateway | PLC gateway | PLC |
| camera | Camera | Camera |
| google-tv | Google TV | TV |
| qnap | QNAP | QNAP |
| shelly-recovery | Shelly recovery unit | Shelly |

実装: `server/src/provisioning/device-templates.ts`

ウィザード / QR 作成時の種別選択に使用。

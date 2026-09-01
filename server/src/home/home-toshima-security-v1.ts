/**
 * 後方互換 shim — 新規は home-toyoshima-security-v1 を参照
 */
export * from "./home-toyoshima-security-v1.js";
export {
  HOME_JP_TOYOSHIMA_SITE_ID_V1 as HOME_JP_TOSHIMA_SITE_ID_V1,
  SEC_JP_TOYOSHIMA_SITE_ID_V1 as SEC_JP_TOSHIMA_SITE_ID_V1,
  TOYOSHIMA_MAIN_DEVICE_ID_V1 as TOSHIMA_MAIN_DEVICE_ID_V1,
  TOYOSHIMA_DETACHED_DEVICE_ID_V1 as TOSHIMA_DETACHED_DEVICE_ID_V1,
  TOYOSHIMA_DI_DEBOUNCE_MS_V1 as TOSHIMA_DI_DEBOUNCE_MS_V1,
  TOYOSHIMA_PATLITE_BLINK_MS_V1 as TOSHIMA_PATLITE_BLINK_MS_V1,
  processToyoshimaSecurityEventV1 as processToshimaSecurityEventV1,
  applyToyoshimaManualControlV1 as applyToshimaManualControlV1,
  buildToyoshimaSecurityDashboardV1 as buildToshimaSecurityDashboardV1,
  resetToyoshimaSecurityStateForTestV1 as resetToshimaSecurityStateForTestV1,
  ensureToyoshimaSecurityRulesV1 as ensureToshimaSecurityRulesV1,
  isToyoshimaSecuritySiteIdV1 as isToshimaSecuritySiteIdV1,
} from "./home-toyoshima-security-v1.js";

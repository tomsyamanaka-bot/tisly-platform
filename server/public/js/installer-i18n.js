/** i18n placeholder — ja fixed UI, en dictionary for future toggle */
const DEFAULT_LOCALE = "ja";
let enDict = {};

export async function loadInstallerI18n() {
  try {
    const res = await fetch("/js/i18n/installer-en.json");
    if (res.ok) enDict = await res.json();
  } catch {
    /* */
  }
}

export function t(key, fallbackJa) {
  if (DEFAULT_LOCALE === "en" && enDict[key]) return enDict[key];
  return fallbackJa ?? key;
}

export function getLocale() {
  return DEFAULT_LOCALE;
}

/** Installer PWA i18n — ja / en with localStorage */
const LOCALE_KEY = "tisly_installer_locale";
const DEFAULT_LOCALE = "ja";
let enDict = {};
let currentLocale = DEFAULT_LOCALE;

export async function loadInstallerI18n() {
  try {
    const res = await fetch("/js/i18n/installer-en.json");
    if (res.ok) enDict = await res.json();
  } catch {
    /* */
  }
  const saved = localStorage.getItem(LOCALE_KEY);
  if (saved === "en" || saved === "ja") currentLocale = saved;
}

export function setInstallerLocale(locale) {
  if (locale !== "ja" && locale !== "en") return;
  currentLocale = locale;
  localStorage.setItem(LOCALE_KEY, locale);
  document.documentElement.lang = locale;
}

export function t(key, fallbackJa) {
  if (currentLocale === "en" && enDict[key]) return enDict[key];
  return fallbackJa ?? key;
}

export function getLocale() {
  return currentLocale;
}

export function applyInstallerI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const fb = el.getAttribute("data-i18n-fallback") ?? el.textContent;
    if (key) el.textContent = t(key, fb);
  });
}

/** Phase946 — 営業画面 i18n ja/en */
const LOCALE_KEY = "tisly_sales_locale";
let enDict = {};
let currentLocale = "ja";

export async function loadSalesI18n() {
  try {
    const res = await fetch("/js/i18n/sales-en.json");
    if (res.ok) enDict = await res.json();
  } catch {
    /* */
  }
  const saved = localStorage.getItem(LOCALE_KEY);
  if (saved === "en" || saved === "ja") currentLocale = saved;
  document.documentElement.lang = currentLocale;
}

export function setSalesLocale(locale) {
  if (locale !== "ja" && locale !== "en") return;
  currentLocale = locale;
  localStorage.setItem(LOCALE_KEY, locale);
  document.documentElement.lang = locale;
  applySalesI18n();
}

export function t(key, fallbackJa) {
  if (currentLocale === "en" && enDict[key]) return enDict[key];
  return fallbackJa ?? key;
}

export function getSalesLocale() {
  return currentLocale;
}

export function applySalesI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const fb = el.getAttribute("data-i18n-fallback") ?? el.textContent;
    if (key) el.textContent = t(key, fb);
  });
}

export function wireSalesI18nToggle() {
  document.querySelectorAll("[data-locale]").forEach((btn) => {
    btn.addEventListener("click", () => setSalesLocale(btn.getAttribute("data-locale")));
    btn.classList.toggle("primary", btn.getAttribute("data-locale") === currentLocale);
  });
}

/**
 * 最近のできごと · センサー検知履歴モーダル
 * 白ベース × ネイビー · 直近50件カード一覧
 */
const HISTORY_API = "/api/security-floor/v1/history";
const HISTORY_LIMIT = 50;
const HISTORY_TITLE = "🛡️ センサー検知・セキュリティ履歴（直近50件）";

function $(id) {
  return document.getElementById(id);
}

export function setSecurityHistorySiteIdV1(siteId) {
  const id = String(siteId || "").trim();
  if (id) {
    window.__TISLY_SF_SITE_ID = id;
    document.body?.setAttribute("data-sf-site-id", id);
  }
}

export function resolveSecurityHistorySiteIdV1() {
  const fromWindow = String(window.__TISLY_SF_SITE_ID || "").trim();
  if (fromWindow) return fromWindow;
  const fromBody = String(
    document.body?.getAttribute("data-sf-site-id") || ""
  ).trim();
  if (fromBody) return fromBody;
  const q = new URLSearchParams(location.search).get("siteId");
  return String(q || "").trim();
}

function resolveCustomerCodeV1() {
  try {
    const code = String(window.__TISLY_CUSTOMER_CODE || "").trim();
    if (code) return code.toUpperCase();
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem("tisly_customer_session_v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      const code = String(
        parsed?.customerCode || parsed?.customer_code || ""
      ).trim();
      if (code) return code.toUpperCase();
    }
  } catch {
    /* ignore */
  }
  return "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatHistoryAtV1(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso || "");
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const pick = (type) => parts.find((p) => p.type === type)?.value || "";
    const hour = pick("hour") === "24" ? "00" : pick("hour");
    return `${pick("year")}/${pick("month")}/${pick("day")} ${hour}:${pick("minute")}:${pick("second")}`;
  } catch {
    return String(iso || "");
  }
}

function normalizeHistoryItemV1(row) {
  const at = String(row?.at || row?.createdAt || "");
  return {
    id: String(row?.id || at),
    at,
    atLabel: String(row?.atLabel || formatHistoryAtV1(at)),
    sensorLabel: String(
      row?.sensorLabel ||
        row?.deviceLabel ||
        row?.kindLabel ||
        "センサー"
    ),
    resultLabel: String(
      row?.resultLabel || "防犯ライト点灯・通知送信済み"
    ),
    icon: String(row?.icon || "🚨"),
  };
}

function historyCardHtmlV1(item) {
  const row = normalizeHistoryItemV1(item);
  return `<article class="sf-hist-card">
    <span class="sf-hist-ico" aria-hidden="true">${escapeHtml(row.icon)}</span>
    <div class="sf-hist-body">
      <time class="sf-hist-at">${escapeHtml(row.atLabel)}</time>
      <p class="sf-hist-sensor">${escapeHtml(row.sensorLabel)}</p>
      <p class="sf-hist-result">${escapeHtml(row.resultLabel)}</p>
    </div>
  </article>`;
}

function historyListHtmlV1(items) {
  const rows = Array.isArray(items) ? items.slice(0, HISTORY_LIMIT) : [];
  if (!rows.length) {
    return '<p class="sf-hist-empty">まだできごとはありません</p>';
  }
  return rows.map(historyCardHtmlV1).join("");
}

export function ensureSecurityHistoryDialogV1() {
  let dialog = $("sf-log-dialog") || $("sf-sec-history-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "sf-log-dialog";
    document.body.appendChild(dialog);
  }
  dialog.classList.add("sf-log-dialog", "sf-sec-history-dialog");
  dialog.setAttribute("aria-labelledby", "sf-sec-history-title");
  if (!dialog.querySelector(".sf-sec-history-inner")) {
    dialog.innerHTML = `
      <div class="sf-sec-history-inner">
        <header class="sf-sec-history-head">
          <h2 id="sf-sec-history-title">${HISTORY_TITLE}</h2>
          <button type="button" class="sf-sec-history-x" data-sf-history-close>
            ✕ 閉じる
          </button>
        </header>
        <div class="sf-sec-history-list" id="sf-sec-history-list"></div>
        <footer class="sf-sec-history-foot">
          <button type="button" class="sf-sec-history-close" data-sf-history-close>
            閉じる
          </button>
        </footer>
      </div>`;
  }
  return dialog;
}

function closeSecurityHistoryDialogV1() {
  const dialog = $("sf-log-dialog") || $("sf-sec-history-dialog");
  if (!dialog) return;
  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
  dialog.classList.remove("is-open");
}

function showDialogElV1(dialog) {
  if (!dialog) return;
  try {
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  } catch {
    dialog.setAttribute("open", "");
  }
  dialog.classList.add("is-open");
}

function paintHistoryListV1(items) {
  const dialog = ensureSecurityHistoryDialogV1();
  const list =
    $("sf-sec-history-list") ||
    dialog.querySelector(".sf-sec-history-list");
  if (list) list.innerHTML = historyListHtmlV1(items);
  const title = $("sf-sec-history-title");
  if (title) title.textContent = HISTORY_TITLE;
}

async function fetchSecurityHistoryV1(siteId) {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const customerCode = resolveCustomerCodeV1();
  if (customerCode) params.set("customerCode", customerCode);
  if (customerCode === "TESTER001" || /ITABASHI/i.test(siteId || "")) {
    params.set("includeMock", "1");
  }
  params.set("limit", String(HISTORY_LIMIT));
  const res = await fetch(`${HISTORY_API}?${params.toString()}`, {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data?.ok && !Array.isArray(data?.items)) {
    throw new Error(data?.error || "履歴の取得に失敗しました");
  }
  return Array.isArray(data.items) ? data.items : [];
}

function fallbackItemsFromDomV1() {
  const compact = $("sf-log-compact") || $("ts-activity-log");
  if (!compact) return [];
  return [...compact.querySelectorAll("article")].map((el, idx) => ({
    id: `DOM-${idx}`,
    atLabel: el.querySelector("time")?.textContent?.trim() || "",
    sensorLabel:
      el.querySelector(".sf-log-title, .ts-log-title, .ts-hist-what")
        ?.textContent?.trim() || "センサー",
    resultLabel: "防犯ライト点灯・通知送信済み",
    icon: "🚨",
  }));
}

export async function openSecurityHistoryModalV1(opts = {}) {
  const dialog = ensureSecurityHistoryDialogV1();
  const preset = Array.isArray(opts.items) ? opts.items : null;
  if (preset) {
    paintHistoryListV1(preset);
  } else {
    paintHistoryListV1([
      {
        atLabel: "読み込み中…",
        sensorLabel: "センサー履歴を取得しています",
        resultLabel: " ",
        icon: "🛡️",
      },
    ]);
  }
  showDialogElV1(dialog);
  if (preset) return dialog;

  const siteId = String(opts.siteId || resolveSecurityHistorySiteIdV1());
  try {
    const items = await fetchSecurityHistoryV1(siteId);
    paintHistoryListV1(items.length ? items : fallbackItemsFromDomV1());
  } catch (err) {
    console.warn("[security-history]", err);
    const fallback = fallbackItemsFromDomV1();
    paintHistoryListV1(
      fallback.length
        ? fallback
        : [
            {
              atLabel: formatHistoryAtV1(new Date().toISOString()),
              sensorLabel: "履歴を取得できませんでした",
              resultLabel: "通信を確認して再度お試しください",
              icon: "⚠️",
            },
          ]
    );
  }
  return dialog;
}

function isHistoryOpenButtonV1(el) {
  if (!el || !(el instanceof Element)) return false;
  if (el.closest("[data-sf-history-close]")) return false;
  return Boolean(
    el.closest(
      "#sf-log-open-detail, .sf-log-more, [data-ts-action='open_log']"
    )
  );
}

export function bindSecurityHistoryModalV1() {
  if (window.__TISLY_SF_HISTORY_MODAL_BOUND) return;
  window.__TISLY_SF_HISTORY_MODAL_BOUND = true;

  document.addEventListener(
    "click",
    (e) => {
      const closeBtn = e.target.closest?.("[data-sf-history-close]");
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        closeSecurityHistoryDialogV1();
        return;
      }
      if (!isHistoryOpenButtonV1(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      openSecurityHistoryModalV1().catch(() => {});
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeSecurityHistoryDialogV1();
  });
}

bindSecurityHistoryModalV1();

/**
 * 通話音声クイック入力 PWA
 * 貼付 / 音声認識 → AI抽出 → 確定登録
 */

import { getCustomerToken, requireCustomerLogin } from "../../customer-auth.js";
import {
  isSpeechRecognitionSupportedV1,
  startVoiceInputV1,
} from "../../tisly-voice-input-v1.js";
import { DEFAULT_FETCH_TIMEOUT_MS, fetchJson } from "../../tisly-fetch-v1.js";

const API = "/api/voice-call/v1";

const $ = (id) => document.getElementById(id);

/** @type {any} */
let lastExtraction = null;
/** @type {ReturnType<typeof startVoiceInputV1> | null} */
let activeRec = null;

function toast(msg) {
  const el = $("vh-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function selectedLocale() {
  const checked = document.querySelector(
    'input[name="vh-locale"]:checked'
  );
  return checked?.value === "AU" ? "AU" : "JP";
}

async function api(path, opts = {}) {
  const token = getCustomerToken();
  return fetchJson(
    `${API}${path}`,
    {
      ...opts,
      label: opts.label || "通話要約API",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    },
    opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  );
}

async function loadProjects() {
  const sel = $("vh-project");
  if (!sel) return;
  try {
    const data = await api("/projects", { method: "GET", label: "案件一覧" });
    const projects = data.projects || [];
    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = `${p.source}:${p.id}`;
      opt.textContent = `${p.title}${p.customerName ? `（${p.customerName}）` : ""}`;
      sel.appendChild(opt);
    }
  } catch {
    // 案件なしでも自動作成できる
  }
}

function renderPreview(extraction) {
  const box = $("vh-preview");
  box.classList.remove("hidden");
  $("vh-provider").textContent =
    extraction.provider === "gemini"
      ? "抽出エンジン: Gemini"
      : "抽出エンジン: ルールベース（オフライン可）";

  const sch = extraction.schedule;
  const schEl = $("vh-schedule");
  if (!sch) {
    schEl.innerHTML = "<div><dt>予定</dt><dd>なし</dd></div>";
  } else {
    schEl.innerHTML = `
      <div><dt>件名</dt><dd>${escapeHtml(sch.title)}</dd></div>
      <div><dt>開始</dt><dd>${escapeHtml(sch.startAt)}</dd></div>
      <div><dt>終了</dt><dd>${escapeHtml(sch.endAt)}</dd></div>
      <div><dt>場所</dt><dd>${escapeHtml(sch.location || "—")}</dd></div>
    `;
  }

  const mats = extraction.materials || [];
  $("vh-materials").innerHTML = mats.length
    ? mats
        .map(
          (m) =>
            `<li>${escapeHtml(m.label)} × ${escapeHtml(String(m.quantity))}${escapeHtml(
              m.unit || ""
            )}${m.orderTask ? "（発注）" : ""}</li>`
        )
        .join("")
    : "<li>材料なし</li>";

  const memo = extraction.memo || {};
  const lines = [
    ...(memo.summary3Lines || []).filter(Boolean).map((l) => `要約: ${l}`),
    ...(memo.customerRequests || []).map((l) => `要望: ${l}`),
    ...(memo.decisions || []).map((l) => `決定: ${l}`),
  ];
  $("vh-memo").innerHTML = lines.length
    ? lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")
    : "<li>メモなし</li>";
}

async function onPaste() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text?.trim()) {
      toast("クリップボードが空です");
      return;
    }
    $("vh-transcript").value = text.trim();
    toast("貼り付けました");
  } catch {
    toast("貼り付けに失敗（権限を確認）");
  }
}

function onMic() {
  const btn = $("vh-mic");
  const status = $("vh-mic-status");
  if (!isSpeechRecognitionSupportedV1()) {
    status.textContent = "この端末は音声認識非対応です。テキスト貼付を使ってください。";
    toast("音声認識非対応");
    return;
  }
  if (activeRec) {
    try {
      activeRec.stop?.();
    } catch {
      /* ignore */
    }
    activeRec = null;
    btn.classList.remove("is-listening");
    status.textContent = "マイク停止";
    return;
  }
  activeRec = startVoiceInputV1({
    lang: "ja-JP",
    continuous: true,
    interimResults: true,
    onStart: () => {
      btn.classList.add("is-listening");
      status.textContent = "聞き取り中…もう一度押すと停止";
    },
    onInterim: (t) => {
      status.textContent = `認識中: ${t.slice(0, 40)}`;
    },
    onResult: (finalText) => {
      const ta = $("vh-transcript");
      const prev = ta.value.trim();
      ta.value = prev ? `${prev}\n${finalText}` : finalText;
    },
    onError: (err) => {
      status.textContent = `音声エラー: ${err}`;
      btn.classList.remove("is-listening");
      activeRec = null;
    },
    onEnd: () => {
      btn.classList.remove("is-listening");
      status.textContent = "マイク待機中";
      activeRec = null;
    },
  });
}

async function onExtract() {
  const transcript = $("vh-transcript").value.trim();
  if (!transcript) {
    toast("テキストを入力してください");
    return;
  }
  const btn = $("vh-extract");
  btn.disabled = true;
  try {
    const locale = selectedLocale();
    const data = await api("/extract", {
      method: "POST",
      label: "AI抽出",
      body: JSON.stringify({
        transcript,
        locale,
        currency: locale === "AU" ? "AUD" : "JPY",
      }),
      timeoutMs: 60000,
    });
    lastExtraction = data.extraction;
    renderPreview(lastExtraction);
    toast("抽出完了");
    $("vh-commit-result").textContent = "";
  } catch (e) {
    toast(e?.message || "抽出に失敗");
  } finally {
    btn.disabled = false;
  }
}

async function onCommit() {
  if (!lastExtraction) {
    toast("先に抽出してください");
    return;
  }
  const btn = $("vh-commit");
  btn.disabled = true;
  try {
    const locale = selectedLocale();
    const projectVal = $("vh-project").value;
    let projectSource;
    let projectId;
    if (projectVal.includes(":")) {
      const [src, id] = projectVal.split(":");
      projectSource = src;
      projectId = id;
    }
    const result = await api("/commit", {
      method: "POST",
      label: "確定登録",
      body: JSON.stringify({
        extraction: lastExtraction,
        projectSource,
        projectId,
        countryCode: locale,
        currency: locale === "AU" ? "AUD" : "JPY",
        transcript: $("vh-transcript").value.trim(),
      }),
      timeoutMs: 60000,
    });
    $("vh-commit-result").textContent =
      `登録完了（${result.commitId}）カレンダー:${result.calendar?.mode || "—"} / 材料${result.materials?.added ?? 0}件`;
    toast("確定登録しました");
  } catch (e) {
    toast(e?.message || "登録に失敗");
  } finally {
    btn.disabled = false;
  }
}

async function boot() {
  await requireCustomerLogin();
  $("vh-paste")?.addEventListener("click", onPaste);
  $("vh-mic")?.addEventListener("click", onMic);
  $("vh-extract")?.addEventListener("click", onExtract);
  $("vh-commit")?.addEventListener("click", onCommit);
  await loadProjects();
}

boot();

/**
 * TiSLY 音声入力（ハンズフリーメモ）v1
 * Web Speech API — 見積・ナレッジ・メモ共通
 */

export const VOICE_INPUT_VERSION = "voice-input-v1";

const STYLE_ID = "tisly-voice-input-css";

function ensureCss() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "/css/tisly-voice-input-v1.css";
  document.head.appendChild(link);
}

/** SpeechRecognition 取得（webkit 互換） */
export function getSpeechRecognitionCtorV1() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupportedV1() {
  return Boolean(getSpeechRecognitionCtorV1());
}

/**
 * 見積向け発話パーサ
 * 例: 「VVF2.0 3芯 50メートル」「エアコン本体 5台」
 * @param {string} text
 * @returns {{ name: string; qty: number; unit: string; raw: string }[]}
 */
export function parseEstimateSpeechLinesV1(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const chunks = raw
    .split(/[\n、,．。;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const qtyRe =
    /(\d+(?:\.\d+)?)\s*(台|個|本|式|巻|箱|セット|枚|m|Ｍ|メートル|ﾒｰﾄﾙ|キロ|kg|Kg|Ｋｇ)?\s*$/i;

  return chunks.map((chunk) => {
    const m = chunk.match(qtyRe);
    if (!m) {
      return { name: chunk, qty: 1, unit: "", raw: chunk };
    }
    const qty = Number(m[1]) || 1;
    let unit = (m[2] || "").trim();
    if (/^(m|Ｍ|メートル|ﾒｰﾄﾙ)$/i.test(unit)) unit = "m";
    const name = chunk.slice(0, m.index).trim() || chunk;
    return { name, qty, unit, raw: chunk };
  });
}

/**
 * 音声認識を開始
 * @param {{
 *   lang?: string;
 *   continuous?: boolean;
 *   interimResults?: boolean;
 *   onResult?: (finalText: string, ev: SpeechRecognitionEvent) => void;
 *   onInterim?: (text: string) => void;
 *   onError?: (err: string) => void;
 *   onStart?: () => void;
 *   onEnd?: () => void;
 * }} opts
 */
export function startVoiceInputV1(opts = {}) {
  const Ctor = getSpeechRecognitionCtorV1();
  if (!Ctor) {
    opts.onError?.("unsupported");
    return null;
  }

  const rec = new Ctor();
  rec.lang = opts.lang || "ja-JP";
  rec.continuous = opts.continuous === true;
  rec.interimResults = opts.interimResults !== false;
  rec.maxAlternatives = 3;

  rec.onstart = () => opts.onStart?.();
  rec.onend = () => opts.onEnd?.();
  rec.onerror = (ev) => opts.onError?.(ev?.error || "error");

  rec.onresult = (ev) => {
    let interim = "";
    let finalText = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      const t = r?.[0]?.transcript || "";
      if (r.isFinal) finalText += t;
      else interim += t;
    }
    if (interim) opts.onInterim?.(interim);
    if (finalText) opts.onResult?.(finalText.trim(), ev);
  };

  try {
    rec.start();
  } catch {
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    opts.onError?.("start_failed");
    return null;
  }

  return rec;
}

/**
 * 入力欄へテキストを流し込む（追記/置換）
 * @param {HTMLInputElement|HTMLTextAreaElement|null} el
 * @param {string} text
 * @param {"append"|"replace"} mode
 */
export function applyTranscriptToFieldV1(el, text, mode = "append") {
  if (!el || !text) return;
  const t = String(text).trim();
  if (!t) return;
  if (mode === "replace" || !el.value) {
    el.value = t;
  } else {
    const sep = el.value.endsWith("\n") || el.value.endsWith(" ") ? "" : "\n";
    el.value = `${el.value}${sep}${t}`;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * 🎙️ 音声入力ボタンをマウント
 * @param {HTMLElement} mountEl ボタンを入れる親
 * @param {{
 *   target?: HTMLInputElement|HTMLTextAreaElement|null|(() => HTMLElement|null);
 *   mode?: "append"|"replace";
 *   label?: string;
 *   onTranscript?: (text: string) => void;
 *   toast?: (msg: string) => void;
 * }} opts
 */
export function mountVoiceInputButtonV1(mountEl, opts = {}) {
  if (!mountEl) return null;
  ensureCss();

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tisly-voice-btn";
  btn.setAttribute("aria-label", "音声入力");
  btn.innerHTML = `<span class="tisly-voice-icon">🎙️</span><span class="tisly-voice-label">${
    opts.label || "音声入力"
  }</span>`;

  const status = document.createElement("span");
  status.className = "tisly-voice-status";
  status.setAttribute("aria-live", "polite");

  const wrap = document.createElement("div");
  wrap.className = "tisly-voice-wrap";
  wrap.appendChild(btn);
  wrap.appendChild(status);
  mountEl.appendChild(wrap);

  /** @type {SpeechRecognition|null} */
  let active = null;
  const toast = opts.toast || (() => {});

  function resolveTarget() {
    if (typeof opts.target === "function") return opts.target();
    return opts.target || null;
  }

  function setListening(on) {
    btn.classList.toggle("is-listening", on);
    status.textContent = on
      ? "聞いています…（話し終えると文字になります）"
      : "";
  }

  btn.addEventListener("click", () => {
    if (!isSpeechRecognitionSupportedV1()) {
      toast("この端末では音声入力に対応していません");
      status.textContent = "非対応ブラウザです";
      resolveTarget()?.focus?.();
      return;
    }

    if (active) {
      try {
        active.stop();
      } catch {
        /* ignore */
      }
      active = null;
      setListening(false);
      return;
    }

    active = startVoiceInputV1({
      lang: "ja-JP",
      interimResults: true,
      onStart: () => setListening(true),
      onEnd: () => {
        setListening(false);
        active = null;
      },
      onError: (err) => {
        setListening(false);
        active = null;
        if (err === "not-allowed" || err === "service-not-allowed") {
          toast("マイク許可が必要です");
          status.textContent = "マイク許可を確認してください";
        } else if (err === "no-speech") {
          status.textContent = "音声が聞こえませんでした";
        } else if (err !== "aborted") {
          status.textContent = "音声認識を再試行してください";
        }
      },
      onInterim: (t) => {
        status.textContent = t ? `認識中: ${t}` : "聞いています…";
      },
      onResult: (text) => {
        const target = resolveTarget();
        applyTranscriptToFieldV1(target, text, opts.mode || "append");
        opts.onTranscript?.(text);
        status.textContent = `✓ ${text}`;
        toast("音声を反映しました");
      },
    });
  });

  return { button: btn, status, wrap };
}

/**
 * セレクタ群へ一括マウント（既存フォーム追記）
 * @param {Array<{ mount: string; target: string; mode?: "append"|"replace"; label?: string }>} specs
 */
export function mountVoiceInputsBySelectorsV1(specs, opts = {}) {
  const out = [];
  for (const spec of specs || []) {
    const mount = document.querySelector(spec.mount);
    const target = document.querySelector(spec.target);
    if (!mount) continue;
    if (mount.querySelector(".tisly-voice-wrap")) continue;
    out.push(
      mountVoiceInputButtonV1(mount, {
        target,
        mode: spec.mode || "append",
        label: spec.label,
        toast: opts.toast,
        onTranscript: opts.onTranscript,
      })
    );
  }
  return out;
}

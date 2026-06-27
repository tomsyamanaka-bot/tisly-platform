/**
 * 音声誘導ナビ v1 — Web Speech API ラッパー
 * SpeechSynthesis / SpeechRecognition の
 * 簡易モック対話土台
 */

export const VOICE_NAV_SPEECH_LANG = "ja-JP";

/**
 * @returns {boolean}
 */
export function isVoiceNavSpeechSupportedV1() {
  const hasTts = typeof window !== "undefined" && "speechSynthesis" in window;
  const SR =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  return Boolean(hasTts && SR);
}

/**
 * @param {object} [opts]
 * @param {(text: string) => void} [opts.onTranscript]
 * @param {(err: string) => void} [opts.onError]
 * @param {() => void} [opts.onListenStart]
 * @param {() => void} [opts.onListenEnd]
 */
export function createVoiceNavSpeechV1(opts = {}) {
  /** @type {SpeechSynthesisUtterance|null} */
  let currentUtterance = null;
  /** @type {SpeechRecognition|null} */
  let recognition = null;
  let listening = false;
  let speaking = false;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  /**
   * @param {string} text
   * @returns {Promise<void>}
   */
  function speak(text) {
    return new Promise((resolve, reject) => {
      if (!text.trim()) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = VOICE_NAV_SPEECH_LANG;
      u.rate = 0.95;
      currentUtterance = u;
      speaking = true;
      u.onend = () => {
        speaking = false;
        currentUtterance = null;
        resolve();
      };
      u.onerror = (ev) => {
        speaking = false;
        currentUtterance = null;
        reject(new Error(ev.error || "tts_error"));
      };
      window.speechSynthesis.speak(u);
    });
  }

  function stopSpeak() {
    window.speechSynthesis.cancel();
    speaking = false;
    currentUtterance = null;
  }

  function ensureRecognition() {
    if (recognition) return recognition;
    if (!SR) return null;
    recognition = new SR();
    recognition.lang = VOICE_NAV_SPEECH_LANG;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.continuous = false;

    recognition.onresult = (ev) => {
      const results = ev.results;
      if (!results.length) return;
      const best = results[0][0]?.transcript ?? "";
      opts.onTranscript?.(best);
    };

    recognition.onerror = (ev) => {
      listening = false;
      opts.onError?.(ev.error || "recognition_error");
      opts.onListenEnd?.();
    };

    recognition.onend = () => {
      listening = false;
      opts.onListenEnd?.();
    };

    return recognition;
  }

  function startListen() {
    const rec = ensureRecognition();
    if (!rec || listening) return false;
    try {
      listening = true;
      opts.onListenStart?.();
      rec.start();
      return true;
    } catch {
      listening = false;
      return false;
    }
  }

  function stopListen() {
    if (!recognition || !listening) return;
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    listening = false;
  }

  function isListening() {
    return listening;
  }

  function isSpeaking() {
    return speaking;
  }

  function destroy() {
    stopListen();
    stopSpeak();
    recognition = null;
  }

  return {
    speak,
    stopSpeak,
    startListen,
    stopListen,
    isListening,
    isSpeaking,
    destroy,
  };
}

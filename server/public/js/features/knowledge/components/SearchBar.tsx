import { useCallback, useRef } from "react";
import type { ChangeEvent } from "react";

export interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onToast?: (message: string) => void;
}

/**
 * 大きな検索窓とマイクボタン
 * 現場では指と声の両方で探せる
 */
export function SearchBar({ query, onQueryChange, onToast }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onQueryChange(e.target.value);
    },
    [onQueryChange]
  );

  const handleMic = useCallback(() => {
    const win = window as Window & {
      SpeechRecognition?: typeof SpeechRecognition;
      webkitSpeechRecognition?: typeof SpeechRecognition;
    };
    const SpeechRecognition =
      win.SpeechRecognition ?? win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      onToast?.("この端末は音声検索に未対応です");
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "ja-JP";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (!text) return;
      onQueryChange(text);
      onToast?.("音声を反映しました");
    };

    rec.onerror = () => {
      onToast?.("音声が拾えませんでした");
    };

    try {
      rec.start();
      onToast?.("話しかけてください");
    } catch {
      onToast?.("マイクを開始できません");
    }
  }, [onQueryChange, onToast]);

  return (
    <div className="kn-search-bar">
      <div className="kn-search-row">
        <input
          ref={inputRef}
          type="search"
          className="kn-search-input"
          placeholder="キーワードで探す"
          autoComplete="off"
          enterKeyHint="search"
          aria-label="ナレッジ検索"
          value={query}
          onChange={handleInput}
        />
        <button
          type="button"
          className="kn-mic-btn"
          aria-label="音声で検索"
          onClick={handleMic}
        >
          <span className="kn-mic-icon" aria-hidden="true">
            🎤
          </span>
        </button>
      </div>
    </div>
  );
}

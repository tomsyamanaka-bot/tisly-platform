import { useCallback, useState, type KeyboardEvent } from "react";
import { parseTagsFromText } from "../api/knowledgeModuleApi";

export interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

/**
 * タグ入力 — コンマ/スペース/Enter で確定、チップ表示
 */
export function TagInput({ tags, onChange, placeholder }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commitDraft = useCallback(
    (raw: string) => {
      const next = parseTagsFromText(raw);
      if (!next.length) return;
      const merged = [...tags];
      const seen = new Set(tags);
      for (const tag of next) {
        if (seen.has(tag)) continue;
        seen.add(tag);
        merged.push(tag);
      }
      onChange(merged);
      setDraft("");
    },
    [tags, onChange]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "、") {
      e.preventDefault();
      commitDraft(draft);
      return;
    }
    if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  const handleBlur = () => {
    if (draft.trim()) commitDraft(draft);
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className="kn-tag-input">
      <div className="kn-tag-input-chips">
        {tags.map((tag) => (
          <span key={tag} className="kn-tag-chip">
            #{tag}
            <button
              type="button"
              className="kn-tag-chip-remove"
              aria-label={`${tag} を削除`}
              onClick={() => removeTag(tag)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="kn-tag-input-field"
          placeholder={tags.length ? "タグを追加" : placeholder ?? "タグ（例: IoT, 施工方法）"}
          aria-label="タグ"
          value={draft}
          onChange={(e) => {
            const val = e.target.value;
            if (/[,、\s]/.test(val)) {
              commitDraft(val);
            } else {
              setDraft(val);
            }
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      </div>
      <p className="kn-tag-input-hint">Enter · コンマ · スペースで確定</p>
    </div>
  );
}

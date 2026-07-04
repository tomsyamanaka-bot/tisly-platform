import { useCallback, useRef, useState, type DragEvent } from "react";

export interface PdfUploadProps {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

/**
 * PDF添付 — ボタン選択 + ドラッグ＆ドロップ
 */
export function PdfUpload({ file, onChange, disabled }: PdfUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  const acceptPdf = useCallback(
    (candidate: File | null) => {
      if (!candidate) {
        onChange(null);
        setError("");
        return;
      }
      const name = candidate.name.toLowerCase();
      const isPdf =
        candidate.type === "application/pdf" ||
        name.endsWith(".pdf");
      if (!isPdf) {
        setError("PDFファイルのみ添付できます");
        return;
      }
      setError("");
      onChange(candidate);
    },
    [onChange]
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0] ?? null;
    acceptPdf(dropped);
  };

  return (
    <div className="kn-pdf-upload">
      <div
        className={`kn-pdf-drop${dragOver ? " is-dragover" : ""}${file ? " has-file" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {file ? (
          <>
            <span className="kn-pdf-icon" aria-hidden="true">
              📄
            </span>
            <span className="kn-pdf-name">{file.name}</span>
            <button
              type="button"
              className="kn-pdf-clear"
              disabled={disabled}
              onClick={() => acceptPdf(null)}
            >
              削除
            </button>
          </>
        ) : (
          <>
            <span className="kn-pdf-icon" aria-hidden="true">
              📎
            </span>
            <p className="kn-pdf-hint">PDFをドラッグ＆ドロップ</p>
            <button
              type="button"
              className="kn-pdf-select-btn"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              ファイルを添付（PDFのみ）
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="kn-pdf-file-input"
          disabled={disabled}
          onChange={(e) => acceptPdf(e.target.files?.[0] ?? null)}
        />
      </div>
      {error ? <p className="kn-pdf-error">{error}</p> : null}
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  detectKnowledgeMediaKind,
  isAllowedKnowledgeMediaFile,
  type KnowledgeMediaKind,
} from "../utils/mediaAttachment";

export interface PdfUploadProps {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

const ACCEPT =
  "application/pdf,image/*,video/*,.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.mp4,.mov";

/**
 * メディア・ファイル添付
 * （PDF / 写真 / 動画）
 * ボタン選択 + ドラッグ＆ドロップ
 */
export function PdfUpload({ file, onChange, disabled }: PdfUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptMedia = useCallback(
    (candidate: File | null) => {
      if (!candidate) {
        onChange(null);
        setError("");
        return;
      }
      if (!isAllowedKnowledgeMediaFile(candidate)) {
        setError(
          "PDF・写真（jpg/png/heic/webp）・動画（mp4/mov）のみ添付できます"
        );
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
    acceptMedia(dropped);
  };

  const kind: KnowledgeMediaKind | null = file
    ? detectKnowledgeMediaKind(file.name, file.type)
    : null;

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
            <MediaPreview
              kind={kind ?? "unknown"}
              previewUrl={previewUrl}
              fileName={file.name}
            />
            <span className="kn-pdf-name">{file.name}</span>
            <button
              type="button"
              className="kn-pdf-clear"
              disabled={disabled}
              onClick={() => acceptMedia(null)}
            >
              削除
            </button>
          </>
        ) : (
          <>
            <span className="kn-pdf-icon" aria-hidden="true">
              📎
            </span>
            <p className="kn-pdf-hint">
              PDF・写真・動画をドラッグ＆ドロップ
            </p>
            <button
              type="button"
              className="kn-pdf-select-btn"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              ファイルを添付（PDF・写真・動画）
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="kn-pdf-file-input"
          disabled={disabled}
          onChange={(e) => acceptMedia(e.target.files?.[0] ?? null)}
        />
      </div>
      {error ? <p className="kn-pdf-error">{error}</p> : null}
    </div>
  );
}

function MediaPreview({
  kind,
  previewUrl,
  fileName,
}: {
  kind: KnowledgeMediaKind;
  previewUrl: string | null;
  fileName: string;
}) {
  if (kind === "image" && previewUrl) {
    // HEIC 等はブラウザ非対応のことがある
    return (
      <img
        className="kn-media-thumb"
        src={previewUrl}
        alt={`${fileName} のプレビュー`}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  if (kind === "video" && previewUrl) {
    return (
      <video
        className="kn-media-thumb kn-media-thumb-video"
        src={previewUrl}
        muted
        playsInline
        preload="metadata"
        controls
        aria-label={`${fileName} のプレビュー`}
      />
    );
  }
  return (
    <span className="kn-pdf-icon" aria-hidden="true">
      {kind === "pdf" ? "📄" : kind === "video" ? "🎬" : "🖼"}
    </span>
  );
}

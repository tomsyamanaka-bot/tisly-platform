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
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

const ACCEPT =
  "application/pdf,image/*,video/*,.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.mp4,.mov";

/**
 * メディア・ファイル添付
 * （PDF / 写真 / 動画）
 * 複数選択 + 追加選択 + ドラッグ＆ドロップ
 */
export function PdfUpload({ files, onChange, disabled }: PdfUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  const appendMedia = useCallback(
    (candidates: File[]) => {
      const allowed = candidates.filter(isAllowedKnowledgeMediaFile);
      const rejectedCount = candidates.length - allowed.length;
      const seen = new Set(
        files.map((file) => `${file.name}:${file.size}:${file.lastModified}`)
      );
      const additions = allowed.filter((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (rejectedCount > 0) {
        setError(
          `${rejectedCount}件は未対応です。PDF・写真・動画のみ添付できます`
        );
      } else {
        setError("");
      }
      if (additions.length > 0) onChange([...files, ...additions]);
      if (inputRef.current) inputRef.current.value = "";
    },
    [files, onChange]
  );

  const removeMedia = useCallback(
    (index: number) => {
      setError("");
      onChange(files.filter((_, fileIndex) => fileIndex !== index));
    },
    [files, onChange]
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    appendMedia(Array.from(e.dataTransfer.files ?? []));
  };

  return (
    <div className="kn-pdf-upload">
      <div
        className={`kn-pdf-drop${dragOver ? " is-dragover" : ""}${
          files.length > 0 ? " has-files" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <span className="kn-pdf-icon" aria-hidden="true">
          📎
        </span>
        <p className="kn-pdf-hint">
          PDF・写真・動画を複数選択、またはドラッグ＆ドロップ
        </p>
        <button
          type="button"
          className="kn-pdf-select-btn"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {files.length > 0
            ? "＋ ファイルを追加"
            : "ファイルを添付（PDF・写真・動画）"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="kn-pdf-file-input"
          disabled={disabled}
          onChange={(e) => appendMedia(Array.from(e.target.files ?? []))}
        />
      </div>
      {files.length > 0 ? (
        <div className="kn-attachment-grid" aria-label={`添付中 ${files.length}件`}>
          {files.map((file, index) => (
            <FilePreview
              key={`${file.name}:${file.size}:${file.lastModified}`}
              file={file}
              disabled={disabled}
              onRemove={() => removeMedia(index)}
            />
          ))}
        </div>
      ) : null}
      {error ? <p className="kn-pdf-error">{error}</p> : null}
    </div>
  );
}

function FilePreview({
  file,
  disabled,
  onRemove,
}: {
  file: File;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const kind: KnowledgeMediaKind = detectKnowledgeMediaKind(file.name, file.type);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="kn-attachment-item">
      <MediaPreview kind={kind} previewUrl={previewUrl} fileName={file.name} />
      <span className="kn-attachment-name" title={file.name}>
        {file.name}
      </span>
      <button
        type="button"
        className="kn-attachment-remove"
        aria-label={`${file.name} を削除`}
        disabled={disabled}
        onClick={onRemove}
      >
        ×
      </button>
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

import type { KnowledgeItem } from "../data/mockKnowledge";
import {
  knowledgeMediaLabel,
  normalizeKnowledgeMediaAttachments,
  type KnowledgeMediaAttachment,
} from "../utils/mediaAttachment";

export interface KnowledgeCardProps {
  item: KnowledgeItem;
  onOpen?: (item: KnowledgeItem) => void;
  onEdit?: (item: KnowledgeItem) => void;
}

/**
 * ナレッジ1件のカード
 * タイトル · 要約 · タグ · 添付メディア
 */
export function KnowledgeCard({ item, onOpen, onEdit }: KnowledgeCardProps) {
  const medias = normalizeKnowledgeMediaAttachments(
    item as unknown as Record<string, unknown>
  );

  return (
    <article className="kn-card" data-id={item.id}>
      <div className="kn-card-head">
        <h2 className="kn-card-title">{item.title}</h2>
        {medias.length > 0 ? (
          <span className="kn-media-count">📎 {medias.length}件</span>
        ) : null}
      </div>

      <KnowledgeMediaGallery medias={medias} title={item.title} compact />

      <p className="kn-card-summary">{item.summary}</p>
      <div className="kn-card-tags">
        {item.tags.map((tag) => (
          <span key={tag} className="kn-card-tag">
            #{tag}
          </span>
        ))}
      </div>
      <div className="kn-card-actions">
        <button type="button" className="kn-card-action" onClick={() => onOpen?.(item)}>
          詳細を見る
        </button>
        <button
          type="button"
          className="kn-card-action kn-card-edit"
          onClick={() => onEdit?.(item)}
        >
          編集
        </button>
      </div>
    </article>
  );
}

export interface KnowledgeCardListProps {
  items: KnowledgeItem[];
  onOpen?: (item: KnowledgeItem) => void;
  onEdit?: (item: KnowledgeItem) => void;
}

/** カード一覧（0件時は案内文） */
export function KnowledgeCardList({ items, onOpen, onEdit }: KnowledgeCardListProps) {
  if (items.length === 0) {
    return <p className="kn-empty">該当するナレッジがありません</p>;
  }

  return (
    <div className="kn-card-list">
      {items.map((item) => (
        <KnowledgeCard key={item.id} item={item} onOpen={onOpen} onEdit={onEdit} />
      ))}
    </div>
  );
}

export function KnowledgeMediaGallery({
  medias,
  title,
  compact = false,
}: {
  medias: KnowledgeMediaAttachment[];
  title: string;
  compact?: boolean;
}) {
  if (medias.length === 0) return null;
  return (
    <div className={`kn-media-gallery${compact ? " is-compact" : ""}`}>
      {medias.map((media, index) => (
        <div className="kn-gallery-item" key={`${media.url}:${index}`}>
          {media.kind === "image" ? (
            <a href={media.url} target="_blank" rel="noopener noreferrer">
              <img
                className="kn-card-media-preview"
                src={media.url}
                alt={`${title} 添付写真 ${index + 1}`}
                loading="lazy"
              />
            </a>
          ) : media.kind === "video" ? (
            <video
              className="kn-card-media-preview kn-card-media-video"
              src={media.url}
              controls
              playsInline
              preload="metadata"
              aria-label={`${title} 添付動画 ${index + 1}`}
            />
          ) : (
            <a
              className="kn-gallery-file"
              href={media.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span aria-hidden="true">{media.kind === "pdf" ? "📄" : "📎"}</span>
              <span>{media.fileName || knowledgeMediaLabel(media.kind)}</span>
            </a>
          )}
          <span className="kn-card-media-badge">
            {knowledgeMediaLabel(media.kind)} {index + 1}/{medias.length}
          </span>
        </div>
      ))}
    </div>
  );
}

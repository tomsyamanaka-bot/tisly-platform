import type { KnowledgeItem } from "../data/mockKnowledge";
import {
  detectKnowledgeMediaKind,
  knowledgeMediaLabel,
} from "../utils/mediaAttachment";

export interface KnowledgeCardProps {
  item: KnowledgeItem;
}

/**
 * ナレッジ1件のカード
 * タイトル · 要約 · タグ · 添付メディア
 */
export function KnowledgeCard({ item }: KnowledgeCardProps) {
  const mediaUrl = item.pdf_url?.trim() || null;
  const kind = mediaUrl
    ? detectKnowledgeMediaKind(mediaUrl)
    : null;

  return (
    <article className="kn-card" data-id={item.id}>
      <div className="kn-card-head">
        <h2 className="kn-card-title">{item.title}</h2>
        {mediaUrl && kind === "pdf" ? (
          <a
            className="kn-card-pdf"
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${item.title} のPDFを開く`}
          >
            <span aria-hidden="true">📄</span>
            <span>PDF</span>
          </a>
        ) : null}
      </div>

      {mediaUrl && kind === "image" ? (
        <a
          className="kn-card-media-link"
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${item.title} の写真を開く`}
        >
          <img
            className="kn-card-media-preview"
            src={mediaUrl}
            alt=""
            loading="lazy"
          />
          <span className="kn-card-media-badge">
            {knowledgeMediaLabel("image")}
          </span>
        </a>
      ) : null}

      {mediaUrl && kind === "video" ? (
        <div className="kn-card-media-block">
          <video
            className="kn-card-media-preview kn-card-media-video"
            src={mediaUrl}
            controls
            playsInline
            preload="metadata"
            aria-label={`${item.title} の動画`}
          />
          <span className="kn-card-media-badge">
            {knowledgeMediaLabel("video")}
          </span>
        </div>
      ) : null}

      {mediaUrl && kind === "unknown" ? (
        <a
          className="kn-card-pdf"
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${item.title} の添付を開く`}
        >
          <span aria-hidden="true">📎</span>
          <span>添付</span>
        </a>
      ) : null}

      <p className="kn-card-summary">{item.summary}</p>
      <div className="kn-card-tags">
        {item.tags.map((tag) => (
          <span key={tag} className="kn-card-tag">
            #{tag}
          </span>
        ))}
      </div>
    </article>
  );
}

export interface KnowledgeCardListProps {
  items: KnowledgeItem[];
}

/** カード一覧（0件時は案内文） */
export function KnowledgeCardList({ items }: KnowledgeCardListProps) {
  if (items.length === 0) {
    return <p className="kn-empty">該当するナレッジがありません</p>;
  }

  return (
    <div className="kn-card-list">
      {items.map((item) => (
        <KnowledgeCard key={item.id} item={item} />
      ))}
    </div>
  );
}

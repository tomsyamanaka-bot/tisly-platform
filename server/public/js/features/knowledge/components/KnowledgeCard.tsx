import type { KnowledgeItem } from "../data/mockKnowledge";

export interface KnowledgeCardProps {
  item: KnowledgeItem;
}

/**
 * ナレッジ1件のカード
 * タイトル大きめ · 要約 · タグ · 添付PDF
 */
export function KnowledgeCard({ item }: KnowledgeCardProps) {
  const pdfUrl = item.pdf_url?.trim() || null;

  return (
    <article className="kn-card" data-id={item.id}>
      <div className="kn-card-head">
        <h2 className="kn-card-title">{item.title}</h2>
        {pdfUrl ? (
          <a
            className="kn-card-pdf"
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${item.title} のPDFを開く`}
          >
            <span aria-hidden="true">📄</span>
            <span>PDF</span>
          </a>
        ) : null}
      </div>
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
